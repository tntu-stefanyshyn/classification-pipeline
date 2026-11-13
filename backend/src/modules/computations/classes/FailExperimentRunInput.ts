import { Field, ID, InputType } from 'type-graphql';

@InputType({ description: 'Failure of a run, reported by the worker.' })
export class FailExperimentRunInput {
  @Field(() => ID, { description: 'Id of the pipeline.' })
  runId!: string;

  @Field({
    nullable: true,
    description: 'Reason, stored as the status message and in the history.',
  })
  statusMessage?: string;

  /** The claimed execution sending the report; see `Pipeline.executionId`. */
  @Field(() => ID, {
    description:
      'The execution that failed, as returned by `claimExperimentRun`. A report of an execution that is no longer current is ignored.',
  })
  executionId!: string;
}
