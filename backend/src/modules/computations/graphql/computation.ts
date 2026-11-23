import { Arg, Ctx, ID, Mutation, Query, Resolver } from 'type-graphql';
import { OptimizationResult } from '../classes/OptimizationResult';
import { ComputationQueue } from '../classes/ComputationQueue';
import { EnqueueExperimentRunsInput } from '../classes/EnqueueExperimentRunsInput';
import { StopExperimentRunInput } from '../classes/StopExperimentRunInput';
import { CompletePipelineInput } from '../classes/CompleteExperimentRunInput';
import { FailExperimentRunInput } from '../classes/FailExperimentRunInput';
import { ComputationManager } from '../services/ComputationManager';
import { Pipeline } from '../../../core/pipeline';
import { PipelineMachineInfoInput } from '../../../core/pipeline/classes/PipelineMachineInfo';
import { AuthFlow } from '../../auth/services/AuthFlow';
import { ExperimentAccess } from '../../experiments/services/ExperimentAccess';
import type { GraphQLContext } from '../../../types/context';

@Resolver()
export class ComputationResolver {
  private readonly manager = new ComputationManager();
  private readonly auth = new AuthFlow();
  private readonly access = new ExperimentAccess();

  @Query(() => OptimizationResult, {
    description:
      'Runs the optimization of an experiment and returns the best pipeline. Allowed when the experiment is `computing` or `completed` and every pipeline is `completed`, and as a retry when the experiment is already in `optimization` but its optimization status is no longer `optimizing` (for example `failed`): the container then runs again without a status transition. The call returns only when the optimization has finished. Owner only.',
  })
  async optimizeExperimentRuns(
    @Arg('experimentId', () => ID, { description: 'Id of the experiment.' }) experimentId: string,
    @Ctx() context: GraphQLContext
  ): Promise<OptimizationResult> {
    const user = await this.auth.me(context.req);
    await this.access.assertExperimentOwner(user._id, experimentId);
    return this.manager.optimize(experimentId);
  }

  @Mutation(() => Boolean, {
    description:
      'Moves `idle` pipelines of an experiment to `queued`, after checking the graph settings, the allowed queue and that every path has a classification stage. Owner only.',
  })
  async enqueueExperimentRuns(
    @Arg('input', () => EnqueueExperimentRunsInput, {
      description: 'The experiment, the queue and which pipelines to queue.',
    })
    input: EnqueueExperimentRunsInput,
    @Ctx() context: GraphQLContext
  ): Promise<boolean> {
    const user = await this.auth.me(context.req);
    await this.access.assertExperimentOwner(user._id, input.experimentId);
    await this.manager.enqueueRuns(input);
    return true;
  }

  @Mutation(() => Pipeline, {
    description:
      'Stops a running pipeline and returns it to `idle`; any other status is returned unchanged. A cloud job is cancelled. Owner only.',
  })
  async stopExperimentRun(
    @Arg('input', () => StopExperimentRunInput, { description: 'Id of the pipeline to stop.' })
    input: StopExperimentRunInput,
    @Ctx() context: GraphQLContext
  ): Promise<Pipeline> {
    const user = await this.auth.me(context.req);
    await this.access.assertPipelineOwner(user._id, input.runId);
    return this.manager.stopRun(input.runId);
  }

  @Mutation(() => Pipeline, {
    nullable: true,
    description:
      'Takes the next queued pipeline of a queue for a worker, atomically, and starts a new execution. Returns `null` when nothing is queued. Worker operation (service token).',
  })
  claimExperimentRun(
    @Arg('queue', () => ComputationQueue, { description: 'The queue the worker serves.' })
    queue: ComputationQueue,
    @Ctx() context: GraphQLContext,
    @Arg('machineInfo', () => PipelineMachineInfoInput, {
      nullable: true,
      description:
        "The worker's machine. Required for `local` claims (its `hostname` limits the machine to one running run).",
    })
    machineInfo?: PipelineMachineInfoInput
  ): Promise<Pipeline | undefined> {
    this.auth.requireService(context.req);
    return this.manager.claimNextRun(queue, machineInfo);
  }

  @Mutation(() => [Pipeline], {
    description: 'Returns all queued and running pipelines of an experiment to `idle`. Owner only.',
  })
  async pauseExperimentRuns(
    @Arg('experimentId', () => ID, { description: 'Id of the experiment.' }) experimentId: string,
    @Ctx() context: GraphQLContext
  ): Promise<Pipeline[]> {
    const user = await this.auth.me(context.req);
    await this.access.assertExperimentOwner(user._id, experimentId);
    return this.manager.pauseExperimentRuns(experimentId);
  }

  @Mutation(() => [Pipeline], {
    description: 'Queues the `idle` pipelines of an experiment again. Owner only.',
  })
  async resumeExperimentRuns(
    @Arg('experimentId', () => ID, { description: 'Id of the experiment.' }) experimentId: string,
    @Ctx() context: GraphQLContext
  ): Promise<Pipeline[]> {
    const user = await this.auth.me(context.req);
    await this.access.assertExperimentOwner(user._id, experimentId);
    return this.manager.resumeExperimentRuns(experimentId);
  }

  /** False when the report came from an execution that is no longer current. */
  @Mutation(() => Boolean, {
    description:
      'Stores the result of a run and completes it. Returns `false` when the report belongs to an execution that is no longer current. Worker operation (service token).',
  })
  completePipeline(
    @Arg('input', () => CompletePipelineInput, {
      description: 'The pipeline, its execution and the result.',
    })
    input: CompletePipelineInput,
    @Ctx() context: GraphQLContext
  ): Promise<boolean> {
    this.auth.requireService(context.req);
    return this.manager.completePipeline(input);
  }

  /** Ends the run as failed only if `executionId` is still its current execution. */
  @Mutation(() => Pipeline, {
    description:
      'Ends a run as failed (back to `idle` with the reason) if the execution is still current. Worker operation (service token).',
  })
  failExperimentRun(
    @Arg('input', () => FailExperimentRunInput, {
      description: 'The pipeline, its execution and the reason.',
    })
    input: FailExperimentRunInput,
    @Ctx() context: GraphQLContext
  ): Promise<Pipeline> {
    this.auth.requireService(context.req);
    return this.manager.failRun(input);
  }
}
