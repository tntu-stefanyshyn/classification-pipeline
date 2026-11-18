import { Field, ID, InputType } from 'type-graphql';
import { ComputationResultPayloadInput } from './ComputationResultPayload';

@InputType({
  description: 'Result of a finished run, sent by the worker or the compute container.',
})
export class CompletePipelineInput {
  @Field(() => ID, { description: 'Id of the pipeline.' })
  pipelineId!: string;

  @Field(() => ComputationResultPayloadInput, {
    description: 'The result: metrics per cross-validation fold and run statistics.',
  })
  payload!: ComputationResultPayloadInput;

  /** The claimed execution sending the report; see `Pipeline.executionId`. */
  @Field(() => ID, {
    description: 'The execution that finished, as returned by `claimExperimentRun`.',
  })
  executionId!: string;
}
