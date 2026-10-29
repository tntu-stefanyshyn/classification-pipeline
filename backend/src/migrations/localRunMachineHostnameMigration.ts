import { PipelineStatus } from '../core/pipeline/enums';
import { pipelinesCollectionName } from '../core/pipeline/models/PipelineModel';
import { WorkflowType } from '../core/workflow/enums';
import { WorkflowModel } from '../core/workflow/model/WorkflowModel';
import { ComputationQueue } from '../modules/computations/classes/ComputationQueue';
import type { Migration } from './types';

const migrationName = 'local-run-machine-hostname';

/**
 * Local runs claimed before `machineHostname` existed would not block their machine. Copy the
 * hostname the claim stored in the pipeline's `machineInfo`. Only the field is added; statuses
 * are untouched. A machine that already runs two such runs keeps the first one in the index.
 */
export const localRunMachineHostnameMigration: Migration = {
  name: migrationName,
  run: async () => {
    const runs = await WorkflowModel.aggregate<{ _id: unknown; hostname: string }>([
      {
        $match: {
          type: WorkflowType.PIPELINE,
          status: PipelineStatus.running,
          machineHostname: { $exists: false },
        },
      },
      {
        $lookup: {
          from: pipelinesCollectionName,
          localField: 'instanceId',
          foreignField: '_id',
          as: 'pipeline',
        },
      },
      { $unwind: '$pipeline' },
      {
        $match: {
          'pipeline.queue': ComputationQueue.local,
          'pipeline.machineInfo.hostname': { $type: 'string', $ne: '' },
        },
      },
      { $project: { hostname: '$pipeline.machineInfo.hostname' } },
    ]);

    let updatedCount = 0;
    for (const { _id, hostname } of runs) {
      try {
        const { modifiedCount } = await WorkflowModel.updateOne(
          { _id, status: PipelineStatus.running, machineHostname: { $exists: false } },
          { $set: { machineHostname: hostname } }
        );
        updatedCount += modifiedCount;
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
        console.warn(`[migration] ${migrationName}: ${hostname} already runs a local run`);
      }
    }
    return updatedCount;
  },
};
