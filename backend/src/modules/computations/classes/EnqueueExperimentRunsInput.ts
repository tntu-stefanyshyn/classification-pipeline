import { Field, ID, InputType } from 'type-graphql';
import { ComputationQueue } from './ComputationQueue';
import { ObjectIdOrSting } from '../../../types/context';

@InputType()
export class EnqueueExperimentRunsInput {
  @Field(() => ID)
  experimentId!: string;

  @Field(() => ComputationQueue)
  queue!: ComputationQueue;

  @Field(() => ID, { nullable: true })
  pipelineId?: ObjectIdOrSting;

  @Field({ nullable: true })
  runAll?: boolean;

  @Field({ nullable: true })
  rerun?: boolean;
}
