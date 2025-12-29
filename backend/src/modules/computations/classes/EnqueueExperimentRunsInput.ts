import { Field, ID, InputType } from 'type-graphql';
import { ComputationQueue } from './ComputationQueue';

@InputType()
export class EnqueueExperimentRunsInput {
  @Field(() => ID)
  experimentId!: string;

  @Field(() => ComputationQueue)
  queue!: ComputationQueue;

  @Field(() => [ID], { nullable: true })
  pathNodeIds?: string[];

  @Field({ nullable: true })
  runAll?: boolean;

  @Field({ nullable: true })
  rerun?: boolean;
}
