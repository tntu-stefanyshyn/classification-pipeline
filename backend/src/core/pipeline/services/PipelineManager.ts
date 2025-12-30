import { Types } from 'mongoose';
import { GraphManager } from '../../../modules/experiments/services/GraphManager';
import { buildGraphPaths } from '../../../modules/experiments/utils/buildGraphPaths';
import { PipelineModel } from '../models/PipelineModel';
import { PipelineStatus } from '../enums';
import { Pipeline } from '../classes/Pipeline';

export class PipelineManager {
  private readonly graphManager = new GraphManager();

  async generatePipelinesFromGraphStructure(
    experimentId: Types.ObjectId | string
  ): Promise<Pipeline[]> {
    const graphStructure = await this.graphManager.getByExperimentId(experimentId);
    const queues = graphStructure.settings?.queues ?? [];

    const paths = buildGraphPaths(graphStructure.nodes);

    const results = await Promise.all(
      queues.map((queue) =>
        PipelineModel.create(
          paths.map((path) => ({
            experimentId,
            graphStructureId: graphStructure._id,
            queue,
            status: PipelineStatus.idle,
            pathNodeIds: path,
          }))
        )
      )
    );

    return results.flat();
  }
}
