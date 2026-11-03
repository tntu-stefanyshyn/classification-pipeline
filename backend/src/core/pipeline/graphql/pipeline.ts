import { Arg, Ctx, FieldResolver, ID, Mutation, Query, Resolver, Root } from 'type-graphql';
import { Pipeline, PipelineBaseService } from '../../../core/pipeline';
import { GraphNode } from '../../../modules/experiments/classes/GraphNode';
import { GraphStructureModel } from '../../../modules/experiments/models/GraphStructureModel';
import { ComputationQueue } from '../../../modules/computations/classes/ComputationQueue';
import { UpdatePipelineProgressInput } from '../classes/UpdatePipelineProgressInput';
import { UpdatePipelineOptimizationInput } from '../classes/UpdatePipelineOptimizationInput';
import { AuthFlow } from '../../../modules/auth/services/AuthFlow';
import { ExperimentAccess } from '../../../modules/experiments/services/ExperimentAccess';
import { ObjectIdOrString } from '../../../types/context';
import type { GraphQLContext } from '../../../types/context';
import { WorkflowManager } from '../../workflow/services/WorkflowManager';
import { WorkflowType } from '../../workflow/enums';
import { PipelineStatus } from '../enums';
import { ChangePipelineStatusInput } from '../classes/ChangePipelineStatusInput';
import { PipelineManager } from '../services/PipelineManager';

@Resolver(() => Pipeline)
export class PipelineResolver {
  private readonly pipelineManager = new PipelineManager();
  private readonly workflowManager = new WorkflowManager();
  private readonly auth = new AuthFlow();
  private readonly access = new ExperimentAccess();

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
    @Ctx() context: GraphQLContext,
    @Arg('queue', () => ComputationQueue, { nullable: true }) queue?: ComputationQueue
  ): Promise<Pipeline[]> {
    const principal = await this.auth.authenticate(context.req);
    await this.access.assertExperimentAccess(principal, experimentId);
    return PipelineBaseService.listByExperiment(experimentId, queue);
  }

  @Query(() => Pipeline, { nullable: true })
  async pipeline(
    @Arg('pipelineId', () => ID) pipelineId: ObjectIdOrString,
    @Ctx() context: GraphQLContext
  ): Promise<Pipeline | null> {
    const principal = await this.auth.authenticate(context.req);
    await this.access.assertPipelineAccess(principal, pipelineId);
    return PipelineBaseService.getById(pipelineId);
  }
  // #endregion Query

  // #region Mutation
  @Mutation(() => Pipeline)
  updatePipelineProgress(
    @Arg('input', () => UpdatePipelineProgressInput) input: UpdatePipelineProgressInput,
    @Ctx() context: GraphQLContext
  ): Promise<Pipeline> {
    this.auth.requireService(context.req);
    return PipelineBaseService.updatePipelineProgress(input);
  }

  @Mutation(() => Boolean)
  async updatePipelineOptimization(
    @Arg('input', () => UpdatePipelineOptimizationInput) input: UpdatePipelineOptimizationInput,
    @Ctx() context: GraphQLContext
  ): Promise<boolean> {
    this.auth.requireService(context.req);
    await PipelineBaseService.updatePipelineOptimization(input);
    return true;
  }

  @Mutation(() => Boolean)
  async changePipelineStatus(
    @Arg('input', () => ChangePipelineStatusInput) input: ChangePipelineStatusInput,
    @Ctx() context: GraphQLContext
  ): Promise<boolean> {
    const principal = await this.auth.authenticate(context.req);
    await this.access.assertPipelineAccess(principal, input.pipelineId);
    // Runs start only through claimExperimentRun, which enforces one local run per machine.
    if (input.status === PipelineStatus.running) {
      throw new Error('Запуск можна почати лише через claimExperimentRun');
    }
    return this.pipelineManager.changeStatusFromApi(input);
  }
  // #endregion Mutation
}
