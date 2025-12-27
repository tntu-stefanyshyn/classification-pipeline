import { Field, ID, InputType } from 'type-graphql';
import { GraphStageSelectionInput } from './GraphStageSelectionInput';

@InputType()
export class GenerateExperimentGraphInput {
  @Field(() => ID)
  _id!: string;

  @Field(() => [GraphStageSelectionInput])
  stages!: GraphStageSelectionInput[];
}
