import { PipelineStatus } from '../core/pipeline/enums';
import { PipelineModel } from '../core/pipeline/models/PipelineModel';
import type { Migration } from './types';

const migrationName = 'pipeline-history-missing-status-to-running';

// Only worker progress lines were stored without a status, and workers report only while a run
// is running. `status: null` also matches entries that have no status field.
export const pipelineHistoryMissingStatusMigration: Migration = {
  name: migrationName,
  run: async () => {
    const { modifiedCount } = await PipelineModel.updateMany(
      { history: { $elemMatch: { status: null } } },
      { $set: { 'history.$[item].status': PipelineStatus.running } },
      { arrayFilters: [{ 'item.status': null }] }
    );
    return modifiedCount ?? 0;
  },
};
