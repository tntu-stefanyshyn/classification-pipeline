import { Field, ID, InputType, Int } from 'type-graphql';

@InputType()
export class UpdateExperimentRunInput {
  @Field(() => ID)
  runId!: string;

  @Field(() => Int, { nullable: true })
  progress?: number;

  @Field({ nullable: true })
  statusMessage?: string;
}
