import { Arg, ID, Mutation, Query, Resolver } from 'type-graphql';
import { ComputationRun } from '../classes/ComputationRun';
import { ComputationQueue } from '../classes/ComputationQueue';
import { EnqueueExperimentRunsInput } from '../classes/EnqueueExperimentRunsInput';
import { UpdateExperimentRunInput } from '../classes/UpdateExperimentRunInput';
import { CompleteExperimentRunInput } from '../classes/CompleteExperimentRunInput';
import { FailExperimentRunInput } from '../classes/FailExperimentRunInput';
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

  @Mutation(() => [ComputationRun])
  enqueueExperimentRuns(
    @Arg('input', () => EnqueueExperimentRunsInput) input: EnqueueExperimentRunsInput
  ): Promise<ComputationRun[]> {
    return this.manager.enqueueRuns(input);
  }

  @Mutation(() => ComputationRun, { nullable: true })
  claimExperimentRun(
    @Arg('queue', () => ComputationQueue) queue: ComputationQueue
  ): Promise<ComputationRun | null> {
    return this.manager.claimNextRun(queue);
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
