import mongoose from 'mongoose';

import { sleep } from '../utils';
import type { Migration } from './types';
import { AppliedMigrationModel } from './models/AppliedMigrationModel';
import { pipelineLegacyStatusesToIdleMigration } from './pipelineLegacyStatusesToIdleMigration';
import { pipelineHistoryMissingStatusMigration } from './pipelineHistoryMissingStatusMigration';

// A migration is recorded after it succeeds, so one that crashed halfway can run again: each must
// change nothing on a second run.
const migrations: Migration[] = [
  pipelineLegacyStatusesToIdleMigration,
  pipelineHistoryMissingStatusMigration,
];

const LOCK_ID = 'migrations';
const LOCK_LEASE_MS = 5 * 60 * 1000;
const LOCK_RETRY_MS = 500;

// One backend at a time runs migrations; the others wait here and then find every migration
// recorded. The lock is a lease that the owner renews every third of the lease while it runs, so a
// batch of any length keeps it, and a backend that died holding it blocks the others for at most
// `leaseMs`. shortcut: a backend frozen for longer than the lease (a stalled process, not a slow
// migration) can lose it to another backend while one migration is still running; the idempotency
// rule makes that safe, and it stops before the next migration.
const acquireLock = async (leaseMs: number) => {
  const locks = mongoose.connection.collection<{ _id: string; expiresAt: Date }>('migration_lock');
  for (;;) {
    let expiresAt = new Date(Date.now() + leaseMs);
    try {
      // Matches only a missing or expired lock; a held lock makes the upsert hit the duplicate _id.
      await locks.updateOne(
        { _id: LOCK_ID, expiresAt: { $lt: new Date() } },
        { $set: { expiresAt } },
        { upsert: true }
      );
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      await sleep(LOCK_RETRY_MS);
      continue;
    }

    let lost = false;
    let renewing = false;
    const timer = setInterval(async () => {
      if (renewing) return;
      renewing = true;
      try {
        const next = new Date(Date.now() + leaseMs);
        // Matches only our own lease: no match means another backend took the lock over.
        const { matchedCount } = await locks.updateOne(
          { _id: LOCK_ID, expiresAt },
          { $set: { expiresAt: next } }
        );
        if (matchedCount) expiresAt = next;
        else lost = true;
      } catch (error) {
        // Keep trying: the next tick renews it if the lease has not run out meanwhile.
        console.error('[migration] could not renew the lock', error);
      } finally {
        renewing = false;
      }
    }, leaseMs / 3);

    return {
      assertHeld: () => {
        if (lost) throw new Error('The migration lock was taken over by another backend');
      },
      // Deletes only our own lease, never one another backend took over after ours expired.
      release: async () => {
        clearInterval(timer);
        await locks.deleteOne({ _id: LOCK_ID, expiresAt });
      },
    };
  }
};

export const runMigrations = async (
  list: Migration[] = migrations,
  leaseMs = LOCK_LEASE_MS
): Promise<number> => {
  let totalUpdated = 0;
  // The unique index must exist before the first write; Mongoose builds it in the background
  // otherwise. It keeps one record per name if a lease is ever lost under a running migration.
  await AppliedMigrationModel.createIndexes();
  const lock = await acquireLock(leaseMs);
  try {
    // Read after the lock is taken: a backend that waited sees what the one before it recorded.
    const applied = new Set((await AppliedMigrationModel.find().lean()).map(({ name }) => name));

    for (const migration of list) {
      if (applied.has(migration.name)) continue;

      lock.assertHeld();
      const updated = await migration.run();
      if (updated > 0) {
        console.log(`[migration] ${migration.name}: ${updated}`);
      }
      totalUpdated += updated;
      await AppliedMigrationModel.updateOne(
        { name: migration.name },
        { $setOnInsert: { appliedAt: new Date() } },
        { upsert: true }
      );
    }
  } finally {
    await lock.release();
  }

  return totalUpdated;
};
