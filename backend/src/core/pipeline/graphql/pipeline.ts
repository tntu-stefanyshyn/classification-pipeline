import { Arg, FieldResolver, ID, Mutation, Query, Resolver, Root } from 'type-graphql';
import { Pipeline, PipelineBaseService } from '../../../core/pipeline';
import { GraphNode } from '../../../modules/experiments/classes/GraphNode';
import { GraphStructureModel } from '../../../modules/experiments/models/GraphStructureModel';
import { ComputationQueue } from '../../../modules/computations/classes/ComputationQueue';
import { UpdatePipelineInput } from '../classes/UpdatePipelineInput';
import { ObjectIdOrSting } from '../../../types/context';

@Resolver(() => Pipeline)
export class PipelineResolver {
  @FieldResolver(() => [GraphNode])
  async pathNodes(@Root() { experimentId, pathNodeIds }: Pipeline): Promise<GraphNode[]> {
    const graphNodes = await GraphStructureModel.aggregate<GraphNode>([
      { $match: { experimentId } },
      { $unwind: '$nodes' },
      { $replaceRoot: { newRoot: '$nodes' } },
      { $match: { _id: { $in: pathNodeIds } } },
    ]);

    const nodeMap = new Map(graphNodes.map((n) => [n._id.toString(), n]));

    const orderedNodes = pathNodeIds
      .map((id) => nodeMap.get(id.toString()))
      .filter(Boolean) as typeof graphNodes;

    return orderedNodes;
  }

  @Query(() => [Pipeline])
  experimentRuns(
    @Arg('experimentId', () => ID) experimentId: ObjectIdOrSting,
    @Arg('queue', () => ComputationQueue, { nullable: true }) queue?: ComputationQueue
  ): Promise<Pipeline[]> {
    return PipelineBaseService.listByExperiment(experimentId, queue);
  }

  @Query(() => Pipeline, { nullable: true })
  experimentRun(@Arg('runId', () => ID) pipelineId: ObjectIdOrSting): Promise<Pipeline | null> {
    return PipelineBaseService.getById(pipelineId);
  }

  @Mutation(() => Pipeline)
  updateExperimentRun(
    @Arg('input', () => UpdatePipelineInput) input: UpdatePipelineInput
  ): Promise<Pipeline> {
    return PipelineBaseService.update(input);
  }
}
