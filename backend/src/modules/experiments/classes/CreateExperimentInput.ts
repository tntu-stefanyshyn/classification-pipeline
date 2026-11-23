import { Field, ID, InputType } from 'type-graphql';

@InputType({ description: 'Data for a new experiment.' })
export class CreateExperimentInput {
  @Field({ description: 'Name of the experiment.' })
  name!: string;

  @Field({ nullable: true, description: 'Optional description.' })
  description?: string;

  @Field(() => ID, {
    nullable: true,
    description: 'Id of the uploaded CSV file with the dataset. It can be attached later.',
  })
  fileId?: string;
}
