import { Arg, FieldResolver, ID, Mutation, Query, Resolver, Root } from 'type-graphql';
import { Experiment } from '../classes/Experiment';
import { CreateExperimentInput } from '../classes/CreateExperimentInput';
import { GenerateExperimentGraphInput } from '../classes/GenerateExperimentGraphInput';
import { UpdateExperimentInput } from '../classes/UpdateExperimentInput';
import { ExperimentManager } from '../services/ExperimentManager';
import { GraphManager } from '../services/GraphManager';
import { GraphStructure } from '../classes/GraphStructure';
import { ChangeExperimentStatusInput } from '../classes/ChangeExperimentStatusInput';

@Resolver(() => Experiment)
export class Experiments {
  private readonly manager = new ExperimentManager();
  private readonly experimentManager = new ExperimentManager();
  private readonly graphManager = new GraphManager();

  // #region FieldResolver
  @FieldResolver(() => GraphStructure, { nullable: true })
  graph(@Root() experiment: Experiment): Promise<GraphStructure | null> {
    return this.graphManager.getByExperimentId(experiment._id);
  }
  // #endregion FieldResolver

  // #region Query
  @Query(() => [Experiment])
  experiments(): Promise<Experiment[]> {
    return this.manager.list();
  }

  @Query(() => Experiment, { nullable: true })
  experiment(@Arg('_id', () => ID) _id: string): Promise<Experiment | null> {
    return this.manager.getById(_id);
  }
  // #endregion Query

  // #region Mutation
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

  @Mutation(() => Experiment)
  generateExperimentGraph(
    @Arg('input', () => GenerateExperimentGraphInput) input: GenerateExperimentGraphInput
  ): Promise<Experiment> {
    return this.manager.generateGraph(input);
  }

  @Mutation(() => Experiment)
  changeExperimentStatus(
    @Arg('input', () => ChangeExperimentStatusInput) input: ChangeExperimentStatusInput
  ): Promise<boolean> {
    return this.experimentManager.changeStatus(input);
  }

  // #endregion Mutation
}
