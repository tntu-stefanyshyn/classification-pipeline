import { Field, ID, InputType } from 'type-graphql';
import { GraphNodeInput } from './GraphNodeInput';
import { GraphStructureSettings } from './GraphStructureSettings';
import { ComputationMode } from './ComputationMode';

@InputType({ description: 'Changes to an experiment. Send only the fields to change.' })
export class UpdateExperimentInput {
  @Field(() => ID, { description: 'Id of the experiment.' })
  _id!: string;

  @Field({ nullable: true, description: 'New name.' })
  name?: string;

  @Field({ nullable: true, description: 'New description.' })
  description?: string;

  @Field(() => ID, {
    nullable: true,
    description: 'Id of the dataset file to attach; send an empty value to detach it.',
  })
  fileId?: string | null;

  @Field(() => [GraphNodeInput], {
    nullable: true,
    description: 'The whole list of graph nodes; it replaces the current one.',
  })
  graphNodes?: GraphNodeInput[];

  @Field(() => GraphStructureSettings, { nullable: true, description: 'New computation settings.' })
  graphSettings?: GraphStructureSettings;

  @Field(() => ComputationMode, { nullable: true, description: 'New computation mode.' })
  graphComputationMode?: ComputationMode;
}
