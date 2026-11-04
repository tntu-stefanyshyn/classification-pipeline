import type { Migration } from './types';
import { pipelineLegacyStatusesToIdleMigration } from './pipelineLegacyStatusesToIdleMigration';
import { pipelineHistoryMissingStatusMigration } from './pipelineHistoryMissingStatusMigration';

// Every migration runs on each start, so each one must change nothing on a second run.
const migrations: Migration[] = [
  pipelineLegacyStatusesToIdleMigration,
  pipelineHistoryMissingStatusMigration,
];

export const runMigrations = async (): Promise<number> => {
  let totalUpdated = 0;

  for (const migration of migrations) {
    const updated = await migration.run();
    if (updated > 0) {
      console.log(`[migration] ${migration.name}: ${updated}`);
    }
    totalUpdated += updated;
  }

  return totalUpdated;
};
