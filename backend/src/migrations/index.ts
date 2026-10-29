import type { Migration } from './types';
import { pipelineLegacyStatusesToIdleMigration } from './pipelineLegacyStatusesToIdleMigration';
import { localRunMachineHostnameMigration } from './localRunMachineHostnameMigration';

const migrations: Migration[] = [
  pipelineLegacyStatusesToIdleMigration,
  localRunMachineHostnameMigration,
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
