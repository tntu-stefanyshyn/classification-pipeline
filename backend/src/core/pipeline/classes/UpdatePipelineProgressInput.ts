import { Field, Float, ID, InputType } from 'type-graphql';
import { ObjectIdOrString } from '../../../types/context';

@InputType()
export class UpdatePipelineProgressInput {
  @Field(() => ID)
  pipelineId!: ObjectIdOrString;

  @Field(() => Float, { nullable: true })
  progress?: number;

  @Field({ nullable: true })
  message?: string;
}
