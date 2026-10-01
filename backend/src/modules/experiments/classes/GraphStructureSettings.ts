import { prop } from '@typegoose/typegoose';
import { Field, InputType, Int, ObjectType } from 'type-graphql';
import { ComputationQueue } from '../../computations/classes/ComputationQueue';
import { GraphMetricWeights } from './GraphMetricWeights';

@ObjectType()
@InputType('GraphStructureSettingsInput')
export class GraphStructureSettings {
  @Field(() => GraphMetricWeights)
  @prop({ required: true, _id: false, type: () => GraphMetricWeights })
  metrics!: GraphMetricWeights;

  @Field(() => [ComputationQueue])
  @prop({ type: () => [String], enum: ComputationQueue, default: [] })
  queues!: ComputationQueue[];

  @Field(() => Int)
  @prop({ type: () => Number, required: true })
  folds!: number;

  @Field(() => Int, { nullable: true })
  @prop({ type: () => Number, default: 30 })
  hyperOptimizationMinutesPerPipeline?: number;

  @Field(() => Int, { nullable: true })
  @prop({ type: () => Number, default: 20 })
  predictDataPercent?: number;
}
