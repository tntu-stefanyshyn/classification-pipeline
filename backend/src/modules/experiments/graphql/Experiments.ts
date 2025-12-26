import { Arg, FieldResolver, ID, Mutation, Query, Resolver, Root } from 'type-graphql';
import { Experiment } from '../classes/Experiment';
import { CreateExperimentInput } from '../classes/CreateExperimentInput';
import { UpdateExperimentInput } from '../classes/UpdateExperimentInput';
import { ExperimentManager } from '../services/ExperimentManager';
import { GraphManager } from '../services/GraphManager';
import { GraphStructure } from '../classes/GraphStructure';

@Resolver(() => Experiment)
export class Experiments {
  private readonly manager = new ExperimentManager();
  private readonly graphManager = new GraphManager();

  @FieldResolver(() => GraphStructure, { nullable: true })
  graph(@Root() experiment: Experiment): Promise<GraphStructure | null> {
    return this.graphManager.getByExperimentId(experiment._id);
  }

  @Query(() => [Experiment])
  experiments(): Promise<Experiment[]> {
    return this.manager.list();
  }

  @Query(() => Experiment, { nullable: true })
  experiment(@Arg('_id', () => ID) _id: string): Promise<Experiment | null> {
    return this.manager.getById(_id);
  }

  @Mutation(() => Experiment)
  createExperiment(
    @Arg('input', () => CreateExperimentInput) input: CreateExperimentInput
  ): Promise<Experiment> {
    return this.manager.create(input);
  }

  @Mutation(() => Experiment)
  updateExperiment(
    @Arg('input', () => UpdateExperimentInput) input: UpdateExperimentInput
  ): Promise<Experiment> {
    return this.manager.update(input);
  }
}
