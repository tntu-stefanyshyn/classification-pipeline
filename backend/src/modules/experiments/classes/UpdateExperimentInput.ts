import { Field, ID, InputType } from 'type-graphql';
import { GraphNodeInput } from './GraphNodeInput';
import { GraphStructureSettings } from './GraphStructureSettings';
import { ComputationMode } from './ComputationMode';

@InputType()
export class UpdateExperimentInput {
  @Field(() => ID)
  _id!: string;

  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => ID, { nullable: true })
  fileId?: string | null;

  @Field(() => [GraphNodeInput], { nullable: true })
  graphNodes?: GraphNodeInput[];

  @Field(() => GraphStructureSettings, { nullable: true })
  graphSettings?: GraphStructureSettings;

  @Field(() => ComputationMode, { nullable: true })
  graphComputationMode?: ComputationMode;
}
