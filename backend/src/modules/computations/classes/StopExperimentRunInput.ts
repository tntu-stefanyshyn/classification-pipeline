import { Field, ID, InputType } from 'type-graphql';

@InputType({ description: 'Request to stop a run.' })
export class StopExperimentRunInput {
  @Field(() => ID, { description: 'Id of the pipeline to stop.' })
  runId!: string;
}
