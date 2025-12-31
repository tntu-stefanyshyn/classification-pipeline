import { Field, ID, InputType } from 'type-graphql';
import { PipelineStatus } from '../enums';

@InputType()
export class ChangePipelineStatusInput {
  @Field(() => ID)
  pipelineId!: string;

  @Field(() => PipelineStatus)
  status!: PipelineStatus;
}
