import { Field, ID, InputType } from 'type-graphql';

@InputType()
export class FailExperimentRunInput {
  @Field(() => ID)
  runId!: string;

  @Field({ nullable: true })
  statusMessage?: string;
}
