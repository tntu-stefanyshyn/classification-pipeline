import { Field, ID, InputType } from 'type-graphql';
import { PipelineStatus } from '../enums';
import { ObjectIdOrString } from '../../../types/context';

@InputType()
export class ChangePipelineStatusInput {
  @Field(() => ID)
  pipelineId!: ObjectIdOrString;

  @Field(() => PipelineStatus)
  status!: PipelineStatus;

  @Field(() => String, { nullable: true })
  message?: string;
}
