import { Field, Float, ID, InputType } from 'type-graphql';
import { ObjectIdOrString } from '../../../types/context';

@InputType({ description: 'Final result of the optimization, sent by the optimization container.' })
export class UpdateExperimentOptimizationResultInput {
  @Field(() => ID, { description: 'Id of the experiment.' })
  experimentId!: ObjectIdOrString;

  @Field(() => ID, { description: 'Id of the best pipeline.' })
  bestPipelineId!: ObjectIdOrString;

  @Field(() => Float, { description: 'Its integral score. A lower score is better.' })
  score!: number;
}
