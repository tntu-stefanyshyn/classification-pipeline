import mongoose from 'mongoose';

import { sleep } from '../utils';
import type { Migration } from './types';
import { AppliedMigrationModel } from './AppliedMigration';
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
// recorded. The lock is a lease: a backend that died holding it blocks the others for at most
// LOCK_LEASE_MS. shortcut: no heartbeat, so a migration longer than the lease can overlap with
// another backend, which the idempotency rule makes safe; add a heartbeat if one ever runs longer.
const acquireLock = async () => {
  const locks = mongoose.connection.collection<{ _id: string; expiresAt: Date }>('migration_lock');
  for (;;) {
    const expiresAt = new Date(Date.now() + LOCK_LEASE_MS);
    try {
      // Matches only a missing or expired lock; a held lock makes the upsert hit the duplicate _id.
      await locks.updateOne(
        { _id: LOCK_ID, expiresAt: { $lt: new Date() } },
        { $set: { expiresAt } },
        { upsert: true }
      );
      // Deletes only our own lease, never one another backend took over after ours expired.
      return () => locks.deleteOne({ _id: LOCK_ID, expiresAt });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      await sleep(LOCK_RETRY_MS);
    }
  }
};

export const runMigrations = async (list: Migration[] = migrations): Promise<number> => {
  let totalUpdated = 0;
  // The unique index must exist before the first write; Mongoose builds it in the background
  // otherwise. It keeps one record per name if a lease ever expires under a running migration.
  await AppliedMigrationModel.createIndexes();
  const release = await acquireLock();
  try {
    // Read after the lock is taken: a backend that waited sees what the one before it recorded.
    const applied = new Set((await AppliedMigrationModel.find().lean()).map(({ name }) => name));

    for (const migration of list) {
      if (applied.has(migration.name)) continue;

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
    await release();
  }

  return totalUpdated;
};
