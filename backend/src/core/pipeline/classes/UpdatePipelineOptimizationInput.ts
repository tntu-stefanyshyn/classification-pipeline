import { Field, Float, ID, InputType } from 'type-graphql';
import { ObjectIdOrString } from '../../../types/context';

@InputType()
export class UpdatePipelineOptimizationInput {
  @Field(() => ID)
  pipelineId!: ObjectIdOrString;

  @Field(() => Float)
  score!: number;
}
