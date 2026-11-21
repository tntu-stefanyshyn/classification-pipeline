import { Field, Int, ObjectType } from 'type-graphql';

@ObjectType()
export class EnqueueExperimentRunsResult {
  /** Runs that were moved to the queue. */
  @Field(() => Int)
  queued!: number;

  /** Idle runs that changed status before they could be queued (a worker or another client). */
  @Field(() => Int)
  skipped!: number;
}
