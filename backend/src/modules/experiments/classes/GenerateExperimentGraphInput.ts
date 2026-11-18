import { Field, ID, InputType } from 'type-graphql';
import { GraphStageSelectionInput } from './GraphStageSelectionInput';

@InputType({ description: 'Technologies to build a graph from.' })
export class GenerateExperimentGraphInput {
  @Field(() => ID, { description: 'Id of the experiment.' })
  _id!: string;

  @Field(() => [GraphStageSelectionInput], {
    description: 'The technologies chosen for each stage. `CLASSIFICATION` must have at least one.',
  })
  stages!: GraphStageSelectionInput[];
}
