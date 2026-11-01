import { Arg, ID, Mutation, Query, Resolver } from 'type-graphql';
import { OptimizationResult } from '../classes/OptimizationResult';
import { ComputationQueue } from '../classes/ComputationQueue';
import { EnqueueExperimentRunsInput } from '../classes/EnqueueExperimentRunsInput';
import { StopExperimentRunInput } from '../classes/StopExperimentRunInput';
import { CompletePipelineInput } from '../classes/CompleteExperimentRunInput';
import { FailExperimentRunInput } from '../classes/FailExperimentRunInput';
import { ComputationManager } from '../services/ComputationManager';
import { Pipeline } from '../../../core/pipeline';
import { PipelineMachineInfoInput } from '../../../core/pipeline/classes/PipelineMachineInfo';

@Resolver()
export class ComputationResolver {
  private readonly manager = new ComputationManager();

  @Query(() => OptimizationResult)
  async optimizeExperimentRuns(
    @Arg('experimentId', () => ID) experimentId: string
  ): Promise<OptimizationResult> {
    return this.manager.optimize(experimentId);
  }

  @Mutation(() => Boolean)
  async enqueueExperimentRuns(
    @Arg('input', () => EnqueueExperimentRunsInput) input: EnqueueExperimentRunsInput
  ): Promise<boolean> {
    await this.manager.enqueueRuns(input);
    return true;
  }

  @Mutation(() => Pipeline)
  stopExperimentRun(
    @Arg('input', () => StopExperimentRunInput) input: StopExperimentRunInput
  ): Promise<Pipeline> {
    return this.manager.stopRun(input.runId);
  }

  @Mutation(() => Pipeline, { nullable: true })
  claimExperimentRun(
    @Arg('queue', () => ComputationQueue) queue: ComputationQueue,
    @Arg('machineInfo', () => PipelineMachineInfoInput, { nullable: true })
    machineInfo?: PipelineMachineInfoInput
  ): Promise<Pipeline | undefined> {
    return this.manager.claimNextRun(queue, machineInfo);
  }

  @Mutation(() => [Pipeline])
  pauseExperimentRuns(@Arg('experimentId', () => ID) experimentId: string): Promise<Pipeline[]> {
    return this.manager.pauseExperimentRuns(experimentId);
  }

  @Mutation(() => [Pipeline])
  resumeExperimentRuns(@Arg('experimentId', () => ID) experimentId: string): Promise<Pipeline[]> {
    return this.manager.resumeExperimentRuns(experimentId);
  }

  /** False when the report came from an execution that is no longer current. */
  @Mutation(() => Boolean)
  completePipeline(
    @Arg('input', () => CompletePipelineInput) input: CompletePipelineInput
  ): Promise<boolean> {
    return this.manager.completePipeline(input);
  }

  /** Ends the run as failed only if `executionId` is still its current execution. */
  @Mutation(() => Pipeline)
  failExperimentRun(
    @Arg('input', () => FailExperimentRunInput) input: FailExperimentRunInput
  ): Promise<Pipeline> {
    return this.manager.failRun(input);
  }
}
