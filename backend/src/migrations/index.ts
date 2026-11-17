import { randomUUID } from 'node:crypto';

import mongoose from 'mongoose';

import { sleep } from '../utils';
import {
  MIGRATION_LOCK_ID,
  MIGRATION_LOCK_LEASE_MS,
  MIGRATION_LOCK_RETRY_MS,
  migrationLockCollectionName,
} from './constants/migrationLock';
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

// One backend at a time runs migrations; the others wait here and then find every migration
// recorded. The lock is a lease that the owner renews every third of the lease while it runs, so a
// batch of any length keeps it, and a backend that died holding it blocks the others for at most
// `leaseMs`. Every write after the acquisition matches the owner token, never `expiresAt`: a
// renewal still in flight when the migrations end cannot make the release miss our own lock.
// shortcut: a backend frozen for longer than the lease (a stalled process, not a slow migration)
// can lose it to another backend while one migration is still running; the idempotency rule makes
// that safe, and it stops before the next migration.
const acquireLock = async (leaseMs: number) => {
  const locks = mongoose.connection.collection<{ _id: string; owner: string; expiresAt: Date }>(
    migrationLockCollectionName
  );
  const owner = randomUUID();
  for (;;) {
    try {
      // Matches only a missing or expired lock; a held lock makes the upsert hit the duplicate _id.
      await locks.updateOne(
        { _id: MIGRATION_LOCK_ID, expiresAt: { $lt: new Date() } },
        { $set: { owner, expiresAt: new Date(Date.now() + leaseMs) } },
        { upsert: true }
      );
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      await sleep(MIGRATION_LOCK_RETRY_MS);
      continue;
    }

    let lost = false;
    // Renewals may overlap if one is slow; each only moves `expiresAt` forward on our own lock.
    const timer = setInterval(async () => {
      try {
        // No match means another backend took the lock over, or we already released it.
        const { matchedCount } = await locks.updateOne(
          { _id: MIGRATION_LOCK_ID, owner },
          { $set: { expiresAt: new Date(Date.now() + leaseMs) } }
        );
        if (!matchedCount) lost = true;
      } catch (error) {
        // Keep trying: the next tick renews it if the lease has not run out meanwhile.
        console.error('[migration] could not renew the lock', error);
      }
    }, leaseMs / 3);

    return {
      assertHeld: () => {
        if (lost) throw new Error('The migration lock was taken over by another backend');
      },
      // Deletes only our own lock, never one another backend took over after ours expired.
      release: async () => {
        clearInterval(timer);
        await locks.deleteOne({ _id: MIGRATION_LOCK_ID, owner });
      },
    };
  }
};

export const runMigrations = async (
  list: Migration[] = migrations,
  leaseMs = MIGRATION_LOCK_LEASE_MS
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
