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
import { WorkflowType } from '../../workflow/enums';
import { WorkflowModel } from '../../workflow/model/WorkflowModel';
import { PipelineStatus } from '../enums';
import { ChangePipelineStatusInput } from '../classes/ChangePipelineStatusInput';
import { PipelineManager } from '../services/PipelineManager';

@Resolver(() => Pipeline)
export class PipelineResolver {
  private readonly pipelineManager = new PipelineManager();
  private readonly auth = new AuthFlow();
  private readonly access = new ExperimentAccess();

  // #region FieldResolver
  @FieldResolver(() => [GraphNode], { description: 'The graph nodes of the path, in order.' })
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

  @FieldResolver(() => PipelineStatus, { description: 'Current status of the pipeline.' })
  async status(@Root() { _id, rerunOf }: Pipeline) {
    // The newest workflow, as `WorkflowManager.getWorkflow` reads it.
    const workflow = await WorkflowModel.findOne({ instanceId: _id, type: WorkflowType.PIPELINE })
      .sort({ createdAt: -1 })
      .lean();
    if (workflow) return workflow.status;
    // A re-run whose admission stopped between creating it and its workflow: finish it here, so
    // the run list keeps working and the run can be queued again from the desktop.
    if (rerunOf) await this.pipelineManager.ensureRerunWorkflow(_id);
    return PipelineStatus.idle;
  }
  // #endregion FieldResolver

  // #region Query
  @Query(() => [Pipeline], {
    description: 'The pipelines of an experiment, optionally of one queue. Owner or worker.',
  })
  async pipelines(
    @Arg('experimentId', () => ID, { description: 'Id of the experiment.' })
    experimentId: ObjectIdOrString,
    @Ctx() context: GraphQLContext,
    @Arg('queue', () => ComputationQueue, {
      nullable: true,
      description: 'Return only the pipelines of this queue.',
    })
    queue?: ComputationQueue
  ): Promise<Pipeline[]> {
    const principal = await this.auth.authenticate(context.req);
    await this.access.assertExperimentAccess(principal, experimentId);
    return PipelineBaseService.listByExperiment(experimentId, queue);
  }

  @Query(() => Pipeline, { nullable: true, description: 'One pipeline by id. Owner or worker.' })
  async pipeline(
    @Arg('pipelineId', () => ID, { description: 'Id of the pipeline.' })
    pipelineId: ObjectIdOrString,
    @Ctx() context: GraphQLContext
  ): Promise<Pipeline | null> {
    const principal = await this.auth.authenticate(context.req);
    await this.access.assertPipelineAccess(principal, pipelineId);
    return PipelineBaseService.getById(pipelineId);
  }
  // #endregion Query

  // #region Mutation
  @Mutation(() => Pipeline, {
    description:
      'Stores the progress and a message of a running pipeline. Ignored when the execution is no longer current. Worker operation (service token).',
  })
  updatePipelineProgress(
    @Arg('input', () => UpdatePipelineProgressInput, {
      description: 'The pipeline, its execution, progress and message.',
    })
    input: UpdatePipelineProgressInput,
    @Ctx() context: GraphQLContext
  ): Promise<Pipeline> {
    this.auth.requireService(context.req);
    return PipelineBaseService.updatePipelineProgress(input);
  }

  @Mutation(() => Boolean, {
    description: 'Stores the optimization score of a pipeline. Worker operation (service token).',
  })
  async updatePipelineOptimization(
    @Arg('input', () => UpdatePipelineOptimizationInput, {
      description: 'The pipeline and its score.',
    })
    input: UpdatePipelineOptimizationInput,
    @Ctx() context: GraphQLContext
  ): Promise<boolean> {
    this.auth.requireService(context.req);
    await PipelineBaseService.updatePipelineOptimization(input);
    return true;
  }

  @Mutation(() => Boolean, {
    description:
      'Queues an idle pipeline or takes a queued one out of the queue. It cannot start a run or end a running one. Owner or worker.',
  })
  async changePipelineStatus(
    @Arg('input', () => ChangePipelineStatusInput, {
      description: 'The pipeline and the status to move to.',
    })
    input: ChangePipelineStatusInput,
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
