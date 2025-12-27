import { Arg, ID, Mutation, Query, Resolver } from 'type-graphql';
import { ComputationRun } from '../classes/ComputationRun';
import { ComputationResult } from '../classes/ComputationResult';
import { ComputationQueue } from '../classes/ComputationQueue';
import { EnqueueExperimentRunsInput } from '../classes/EnqueueExperimentRunsInput';
import { UpdateExperimentRunInput } from '../classes/UpdateExperimentRunInput';
import { CompleteExperimentRunInput } from '../classes/CompleteExperimentRunInput';
import { FailExperimentRunInput } from '../classes/FailExperimentRunInput';
import { ComputationMachineInfoInput } from '../classes/ComputationMachineInfo';
import { ComputationManager } from '../services/ComputationManager';

@Resolver()
export class Computations {
  private readonly manager = new ComputationManager();

  @Query(() => [ComputationRun])
  experimentRuns(
    @Arg('experimentId', () => ID) experimentId: string,
    @Arg('queue', () => ComputationQueue, { nullable: true }) queue?: ComputationQueue
  ): Promise<ComputationRun[]> {
    return this.manager.listByExperiment(experimentId, queue);
  }

  @Query(() => ComputationRun, { nullable: true })
  experimentRun(@Arg('runId', () => ID) runId: string): Promise<ComputationRun | null> {
    return this.manager.getRunById(runId);
  }

  @Query(() => [ComputationResult])
  experimentResults(
    @Arg('experimentId', () => ID) experimentId: string
  ): Promise<ComputationResult[]> {
    return this.manager.listResultsByExperiment(experimentId);
  }

  @Mutation(() => [ComputationRun])
  enqueueExperimentRuns(
    @Arg('input', () => EnqueueExperimentRunsInput) input: EnqueueExperimentRunsInput
  ): Promise<ComputationRun[]> {
    return this.manager.enqueueRuns(input);
  }

  @Mutation(() => ComputationRun, { nullable: true })
  claimExperimentRun(
    @Arg('queue', () => ComputationQueue) queue: ComputationQueue,
    @Arg('machineInfo', () => ComputationMachineInfoInput, { nullable: true })
    machineInfo?: ComputationMachineInfoInput
  ): Promise<ComputationRun | null> {
    return this.manager.claimNextRun(queue, machineInfo);
  }

  @Mutation(() => [ComputationRun])
  pauseExperimentRuns(
    @Arg('experimentId', () => ID) experimentId: string
  ): Promise<ComputationRun[]> {
    return this.manager.pauseExperimentRuns(experimentId);
  }

  @Mutation(() => [ComputationRun])
  resumeExperimentRuns(
    @Arg('experimentId', () => ID) experimentId: string
  ): Promise<ComputationRun[]> {
    return this.manager.resumeExperimentRuns(experimentId);
  }

  @Mutation(() => ComputationRun)
  updateExperimentRun(
    @Arg('input', () => UpdateExperimentRunInput) input: UpdateExperimentRunInput
  ): Promise<ComputationRun> {
    return this.manager.updateRun(input);
  }

  @Mutation(() => ComputationRun)
  completeExperimentRun(
    @Arg('input', () => CompleteExperimentRunInput) input: CompleteExperimentRunInput
  ): Promise<ComputationRun> {
    return this.manager.completeRun(input);
  }

  @Mutation(() => ComputationRun)
  failExperimentRun(
    @Arg('input', () => FailExperimentRunInput) input: FailExperimentRunInput
  ): Promise<ComputationRun> {
    return this.manager.failRun(input);
  }
}
