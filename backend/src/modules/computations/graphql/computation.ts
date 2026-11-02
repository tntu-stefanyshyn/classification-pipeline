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

  @Query(() => OptimizationResult)
  async optimizeExperimentRuns(
    @Arg('experimentId', () => ID) experimentId: string,
    @Ctx() context: GraphQLContext
  ): Promise<OptimizationResult> {
    await this.access.assertExperimentOwner(context.req, experimentId);
    return this.manager.optimize(experimentId);
  }

  @Mutation(() => Boolean)
  async enqueueExperimentRuns(
    @Arg('input', () => EnqueueExperimentRunsInput) input: EnqueueExperimentRunsInput,
    @Ctx() context: GraphQLContext
  ): Promise<boolean> {
    await this.access.assertExperimentOwner(context.req, input.experimentId);
    await this.manager.enqueueRuns(input);
    return true;
  }

  @Mutation(() => Pipeline)
  async stopExperimentRun(
    @Arg('input', () => StopExperimentRunInput) input: StopExperimentRunInput,
    @Ctx() context: GraphQLContext
  ): Promise<Pipeline> {
    await this.access.assertPipelineOwner(context.req, input.runId);
    return this.manager.stopRun(input.runId);
  }

  @Mutation(() => Pipeline, { nullable: true })
  claimExperimentRun(
    @Arg('queue', () => ComputationQueue) queue: ComputationQueue,
    @Ctx() context: GraphQLContext,
    @Arg('machineInfo', () => PipelineMachineInfoInput, { nullable: true })
    machineInfo?: PipelineMachineInfoInput
  ): Promise<Pipeline | undefined> {
    this.auth.requireService(context.req);
    return this.manager.claimNextRun(queue, machineInfo);
  }

  @Mutation(() => [Pipeline])
  async pauseExperimentRuns(
    @Arg('experimentId', () => ID) experimentId: string,
    @Ctx() context: GraphQLContext
  ): Promise<Pipeline[]> {
    await this.access.assertExperimentOwner(context.req, experimentId);
    return this.manager.pauseExperimentRuns(experimentId);
  }

  @Mutation(() => [Pipeline])
  async resumeExperimentRuns(
    @Arg('experimentId', () => ID) experimentId: string,
    @Ctx() context: GraphQLContext
  ): Promise<Pipeline[]> {
    await this.access.assertExperimentOwner(context.req, experimentId);
    return this.manager.resumeExperimentRuns(experimentId);
  }

  /** False when the report came from an execution that is no longer current. */
  @Mutation(() => Boolean)
  completePipeline(
    @Arg('input', () => CompletePipelineInput) input: CompletePipelineInput,
    @Ctx() context: GraphQLContext
  ): Promise<boolean> {
    this.auth.requireService(context.req);
    return this.manager.completePipeline(input);
  }

  /** Ends the run as failed only if `executionId` is still its current execution. */
  @Mutation(() => Pipeline)
  failExperimentRun(
    @Arg('input', () => FailExperimentRunInput) input: FailExperimentRunInput,
    @Ctx() context: GraphQLContext
  ): Promise<Pipeline> {
    this.auth.requireService(context.req);
    return this.manager.failRun(input);
  }
}
