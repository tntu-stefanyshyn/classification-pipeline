import { Field, ID, InputType } from 'type-graphql';
import { ComputationResultPayloadInput } from './ComputationResultPayload';

@InputType()
export class CompletePipelineInput {
  @Field(() => ID)
  pipelineId!: string;

  @Field(() => ComputationResultPayloadInput)
  payload!: ComputationResultPayloadInput;
}
