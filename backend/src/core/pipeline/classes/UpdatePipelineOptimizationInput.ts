import { Field, Float, ID, InputType } from 'type-graphql';
import { ObjectIdOrString } from '../../../types/context';

@InputType({ description: 'Score of one pipeline calculated by the optimization.' })
export class UpdatePipelineOptimizationInput {
  @Field(() => ID, { description: 'Id of the pipeline.' })
  pipelineId!: ObjectIdOrString;

  @Field(() => Float, { description: 'Integral score of the pipeline. A lower score is better.' })
  score!: number;
}
