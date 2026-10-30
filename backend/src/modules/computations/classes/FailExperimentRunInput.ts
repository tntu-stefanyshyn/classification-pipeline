import { Field, ID, InputType } from 'type-graphql';

@InputType()
export class FailExperimentRunInput {
  @Field(() => ID)
  runId!: string;

  @Field({ nullable: true })
  statusMessage?: string;

  /** The claimed execution sending the report; see `Pipeline.executionId`. */
  @Field(() => ID)
  executionId!: string;
}
