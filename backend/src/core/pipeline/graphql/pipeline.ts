import { Arg, FieldResolver, ID, Mutation, Query, Resolver, Root } from 'type-graphql';
import { Pipeline, PipelineBaseService } from '../../../core/pipeline';
import { GraphNode } from '../../../modules/experiments/classes/GraphNode';
import { GraphStructureModel } from '../../../modules/experiments/models/GraphStructureModel';
import { ComputationQueue } from '../../../modules/computations/classes/ComputationQueue';
import { UpdatePipelineProgressInput } from '../classes/UpdatePipelineProgressInput';
import { UpdatePipelineOptimizationInput } from '../classes/UpdatePipelineOptimizationInput';
import { ObjectIdOrString } from '../../../types/context';
import { WorkflowManager } from '../../workflow/services/WorkflowManager';
import { WorkflowType } from '../../workflow/enums';
import { PipelineStatus } from '../enums';
import { ChangePipelineStatusInput } from '../classes/ChangePipelineStatusInput';
import { PipelineManager } from '../services/PipelineManager';

@Resolver(() => Pipeline)
export class PipelineResolver {
  private readonly pipelineManager = new PipelineManager();
  private readonly workflowManager = new WorkflowManager();

  // #region FieldResolver
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

  @FieldResolver(() => PipelineStatus)
  async status(@Root() { _id }: Pipeline) {
    const workflow = await this.workflowManager.getWorkflow({
      instanceId: _id,
      type: WorkflowType.PIPELINE,
    });
    return workflow.status;
  }
  // #endregion FieldResolver

  // #region Query
  @Query(() => [Pipeline])
  async pipelines(
    @Arg('experimentId', () => ID) experimentId: ObjectIdOrString,
    @Arg('queue', () => ComputationQueue, { nullable: true }) queue?: ComputationQueue
  ): Promise<Pipeline[]> {
    return PipelineBaseService.listByExperiment(experimentId, queue);
  }

  @Query(() => Pipeline, { nullable: true })
  pipeline(@Arg('pipelineId', () => ID) pipelineId: ObjectIdOrString): Promise<Pipeline | null> {
    return PipelineBaseService.getById(pipelineId);
  }
  // #endregion Query

  // #region Mutation
  @Mutation(() => Pipeline)
  updatePipelineProgress(
    @Arg('input', () => UpdatePipelineProgressInput) input: UpdatePipelineProgressInput
  ): Promise<Pipeline> {
    return PipelineBaseService.updatePipelineProgress(input);
  }

  @Mutation(() => Boolean)
  async updatePipelineOptimization(
    @Arg('input', () => UpdatePipelineOptimizationInput) input: UpdatePipelineOptimizationInput
  ): Promise<boolean> {
    await PipelineBaseService.updatePipelineOptimization(input);
    return true;
  }

  @Mutation(() => Boolean)
  changePipelineStatus(
    @Arg('input', () => ChangePipelineStatusInput) input: ChangePipelineStatusInput
  ): Promise<boolean> {
    return this.pipelineManager.changeStatus(input);
  }
  // #endregion Mutation
}
