import type { Migration } from './types';
import { AppliedMigrationModel } from './AppliedMigration';
import { pipelineLegacyStatusesToIdleMigration } from './pipelineLegacyStatusesToIdleMigration';
import { pipelineHistoryMissingStatusMigration } from './pipelineHistoryMissingStatusMigration';

// A migration is recorded after it succeeds, so one that crashed halfway, or that two backends
// started together, can run again: each must change nothing on a second run.
const migrations: Migration[] = [
  pipelineLegacyStatusesToIdleMigration,
  pipelineHistoryMissingStatusMigration,
];

export const runMigrations = async (list: Migration[] = migrations): Promise<number> => {
  let totalUpdated = 0;
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

  return totalUpdated;
};
