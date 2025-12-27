import { Arg, ID, Mutation, Query, Resolver } from 'type-graphql';
import { ComputationRun } from '../classes/ComputationRun';
import { ComputationQueue } from '../classes/ComputationQueue';
import { EnqueueExperimentRunsInput } from '../classes/EnqueueExperimentRunsInput';
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
}
