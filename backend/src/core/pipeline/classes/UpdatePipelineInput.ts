import { Field, ID, InputType, Int } from 'type-graphql';
import { ObjectIdOrSting } from '../../../types/context';

@InputType()
export class UpdatePipelineInput {
  @Field(() => ID)
  pipelineId!: ObjectIdOrSting;

  @Field(() => Int, { nullable: true })
  progress?: number;

  @Field({ nullable: true })
  statusMessage?: string;
}
