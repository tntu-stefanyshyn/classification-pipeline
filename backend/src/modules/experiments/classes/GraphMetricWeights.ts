import { prop } from '@typegoose/typegoose';
import { Field, Float, InputType, ObjectType } from 'type-graphql';

@ObjectType({
  description:
    'Weights of the metrics in the integral score. Each is from 0 to 1 and together they sum to 1.',
})
@InputType('GraphMetricWeightsInput', {
  description:
    'Weights of the metrics in the integral score. Each is from 0 to 1 and together they sum to 1.',
})
export class GraphMetricWeights {
  @Field(() => Float, { description: 'Weight of accuracy.' })
  @prop({ required: true, min: 0, max: 1 })
  accuracy!: number;

  @Field(() => Float, { description: 'Weight of the F1 score.' })
  @prop({ required: true, min: 0, max: 1 })
  f1!: number;

  @Field(() => Float, { description: 'Weight of ROC AUC.' })
  @prop({ required: true, min: 0, max: 1 })
  rocAuc!: number;

  @Field(() => Float, { description: 'Weight of the processing time (NTPS).' })
  @prop({ required: true, min: 0, max: 1 })
  ntps!: number;
}
