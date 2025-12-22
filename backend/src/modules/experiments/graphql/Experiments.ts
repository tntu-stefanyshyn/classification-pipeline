import { Arg, ID, Mutation, Query, Resolver } from 'type-graphql';
import { Experiment } from '../classes/Experiment';
import { CreateExperimentInput } from '../classes/CreateExperimentInput';
import { UpdateExperimentInput } from '../classes/UpdateExperimentInput';
import { ExperimentManager } from '../services/ExperimentManager';

@Resolver()
export class Experiments {
  private readonly manager = new ExperimentManager();

  @Query(() => [Experiment])
  experiments(): Experiment[] {
    return this.manager.list();
  }

  @Query(() => Experiment, { nullable: true })
  experiment(@Arg('id', () => ID) id: string): Experiment | undefined {
    return this.manager.getById(id);
  }

  @Mutation(() => Experiment)
  createExperiment(
    @Arg('input', () => CreateExperimentInput) input: CreateExperimentInput
  ): Experiment {
    return this.manager.create(input);
  }

  @Mutation(() => Experiment)
  updateExperiment(
    @Arg('input', () => UpdateExperimentInput) input: UpdateExperimentInput
  ): Experiment {
    return this.manager.update(input);
  }
}
