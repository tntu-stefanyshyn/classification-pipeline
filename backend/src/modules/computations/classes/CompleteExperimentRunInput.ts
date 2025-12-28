import { Field, ID, InputType } from 'type-graphql';

@InputType()
export class CompleteExperimentRunInput {
  @Field(() => ID)
  runId!: string;

  @Field({ nullable: true })
  statusMessage?: string;

  @Field({ nullable: true })
  resultJson?: string;
}
