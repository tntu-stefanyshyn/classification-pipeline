import { PipelineStatus } from '../core/pipeline/enums';
import { PipelineModel } from '../core/pipeline/models/PipelineModel';
import { WorkflowType } from '../core/workflow/enums';
import { WorkflowModel } from '../core/workflow/model/WorkflowModel';
import type { Migration } from './types';

const LEGACY_PIPELINE_STATUSES = ['paused', 'failed', 'stopped'];

const migrationName = 'pipeline-legacy-statuses-to-idle';

export const pipelineLegacyStatusesToIdleMigration: Migration = {
  name: migrationName,
  run: async () => {
    let updatedCount = 0;

    const workflowsStatusUpdate = await WorkflowModel.updateMany(
      {
        type: WorkflowType.PIPELINE,
        status: { $in: LEGACY_PIPELINE_STATUSES },
      },
      {
        $set: { status: PipelineStatus.idle },
      }
    ).exec();
    updatedCount += workflowsStatusUpdate.modifiedCount ?? 0;

    const workflowsPrevHistoryUpdate = await WorkflowModel.updateMany(
      {
        type: WorkflowType.PIPELINE,
        'history.previousStatus': { $in: LEGACY_PIPELINE_STATUSES },
      },
      {
        $set: { 'history.$[item].previousStatus': PipelineStatus.idle },
      },
      {
        arrayFilters: [{ 'item.previousStatus': { $in: LEGACY_PIPELINE_STATUSES } }],
      }
    ).exec();
    updatedCount += workflowsPrevHistoryUpdate.modifiedCount ?? 0;

    const workflowsNextHistoryUpdate = await WorkflowModel.updateMany(
      {
        type: WorkflowType.PIPELINE,
        'history.nextStatus': { $in: LEGACY_PIPELINE_STATUSES },
      },
      {
        $set: { 'history.$[item].nextStatus': PipelineStatus.idle },
      },
      {
        arrayFilters: [{ 'item.nextStatus': { $in: LEGACY_PIPELINE_STATUSES } }],
      }
    ).exec();
    updatedCount += workflowsNextHistoryUpdate.modifiedCount ?? 0;

    const pipelineHistoryUpdate = await PipelineModel.updateMany(
      { 'history.status': { $in: LEGACY_PIPELINE_STATUSES } },
      {
        $set: { 'history.$[item].status': PipelineStatus.idle },
      },
      {
        arrayFilters: [{ 'item.status': { $in: LEGACY_PIPELINE_STATUSES } }],
      }
    ).exec();
    updatedCount += pipelineHistoryUpdate.modifiedCount ?? 0;

    return updatedCount;
  },
};
