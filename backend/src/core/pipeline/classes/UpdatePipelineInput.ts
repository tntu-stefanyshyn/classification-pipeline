import { Field, ID, InputType, Int } from 'type-graphql';
import { ObjectIdOrString } from '../../../types/context';

@InputType()
export class UpdatePipelineInput {
  @Field(() => ID)
  pipelineId!: ObjectIdOrString;

  @Field(() => Int, { nullable: true })
  progress?: number;

  @Field({ nullable: true })
  statusMessage?: string;
}
