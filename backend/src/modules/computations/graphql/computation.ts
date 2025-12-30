import { Arg, ID, Mutation, Query, Resolver } from 'type-graphql';
import { OptimizationResult } from '../classes/OptimizationResult';
import { ComputationQueue } from '../classes/ComputationQueue';
import { EnqueueExperimentRunsInput } from '../classes/EnqueueExperimentRunsInput';
import { StopExperimentRunInput } from '../classes/StopExperimentRunInput';
import { CompleteExperimentRunInput } from '../classes/CompleteExperimentRunInput';
import { FailExperimentRunInput } from '../classes/FailExperimentRunInput';
import { ComputationManager } from '../services/ComputationManager';
import { Pipeline } from '../../../core/pipeline';
import { PipelineMachineInfoInput } from '../../../core/pipeline/classes/PipelineMachineInfo';
import { ComputationResult } from '../classes/ComputationResult';

@Resolver()
export class ComputationResolver {
  private readonly manager = new ComputationManager();

  @Query(() => [ComputationResult])
  experimentResults(
    @Arg('experimentId', () => ID) experimentId: string
  ): Promise<ComputationResult[]> {
    return this.manager.listResultsByExperiment(experimentId);
  }

  @Query(() => OptimizationResult)
  optimizeExperimentRuns(
    @Arg('experimentId', () => ID) experimentId: string
  ): Promise<OptimizationResult> {
    return this.manager.optimizeExperimentRuns(experimentId);
  }

  @Mutation(() => [Pipeline])
  enqueueExperimentRuns(
    @Arg('input', () => EnqueueExperimentRunsInput) input: EnqueueExperimentRunsInput
  ): Promise<Pipeline[]> {
    return this.manager.enqueueRuns(input);
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
  ): Promise<Pipeline | null> {
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

  @Mutation(() => Pipeline)
  completeExperimentRun(
    @Arg('input', () => CompleteExperimentRunInput) input: CompleteExperimentRunInput
  ): Promise<Pipeline> {
    return this.manager.completeRun(input);
  }

  @Mutation(() => Pipeline)
  failExperimentRun(
    @Arg('input', () => FailExperimentRunInput) input: FailExperimentRunInput
  ): Promise<Pipeline> {
    return this.manager.failRun(input);
  }
}
