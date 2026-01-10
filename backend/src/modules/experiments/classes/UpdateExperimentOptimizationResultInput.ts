import { Field, Float, ID, InputType } from 'type-graphql';
import { ObjectIdOrString } from '../../../types/context';

@InputType()
export class UpdateExperimentOptimizationResultInput {
  @Field(() => ID)
  experimentId!: ObjectIdOrString;

  @Field(() => ID)
  bestPipelineId!: ObjectIdOrString;

  @Field(() => Float)
  score!: number;
}
