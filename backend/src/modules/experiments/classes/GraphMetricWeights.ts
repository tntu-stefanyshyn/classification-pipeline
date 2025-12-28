import { prop } from '@typegoose/typegoose';
import { Field, Float, InputType, ObjectType } from 'type-graphql';

@ObjectType()
@InputType('GraphMetricWeightsInput')
export class GraphMetricWeights {
  @Field(() => Float)
  @prop({ required: true, min: 0, max: 1 })
  accuracy!: number;

  @Field(() => Float)
  @prop({ required: true, min: 0, max: 1 })
  f1!: number;

  @Field(() => Float)
  @prop({ required: true, min: 0, max: 1 })
  rocAuc!: number;

  @Field(() => Float)
  @prop({ required: true, min: 0, max: 1 })
  ntps!: number;
}
