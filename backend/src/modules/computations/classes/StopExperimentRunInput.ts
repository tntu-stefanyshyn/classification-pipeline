import { Field, ID, InputType } from 'type-graphql';

@InputType()
export class StopExperimentRunInput {
  @Field(() => ID)
  runId!: string;
}
