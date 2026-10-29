import { Field, ID, InputType } from 'type-graphql';
import { ComputationResultPayloadInput } from './ComputationResultPayload';

@InputType()
export class CompletePipelineInput {
  @Field(() => ID)
  pipelineId!: string;

  @Field(() => ComputationResultPayloadInput)
  payload!: ComputationResultPayloadInput;

  /** The claimed execution sending the report; see `Pipeline.executionId`. */
  @Field(() => ID, { nullable: true })
  executionId?: string;
}
