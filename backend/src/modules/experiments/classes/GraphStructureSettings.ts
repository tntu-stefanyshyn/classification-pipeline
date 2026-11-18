import { prop } from '@typegoose/typegoose';
import { Field, InputType, Int, ObjectType } from 'type-graphql';
import { ComputationQueue } from '../../computations/classes/ComputationQueue';
import { GraphMetricWeights } from './GraphMetricWeights';

@ObjectType({ description: 'Computation settings of a graph.' })
@InputType('GraphStructureSettingsInput', { description: 'Computation settings of a graph.' })
export class GraphStructureSettings {
  @Field(() => GraphMetricWeights, { description: 'Weights of the metrics in the integral score.' })
  @prop({ required: true, _id: false, type: () => GraphMetricWeights })
  metrics!: GraphMetricWeights;

  @Field(() => [ComputationQueue], {
    description: 'Queues the experiment may run in; at least one.',
  })
  @prop({ type: () => [String], enum: ComputationQueue, default: [] })
  queues!: ComputationQueue[];

  @Field(() => Int, { description: 'Number of cross-validation folds, from 1 to 20.' })
  @prop({ type: () => Number, required: true })
  folds!: number;

  @Field(() => Int, {
    nullable: true,
    description: 'Minutes of optimization per pipeline, at least 1. Default 30.',
  })
  @prop({ type: () => Number, default: 30 })
  hyperOptimizationMinutesPerPipeline?: number;

  @Field(() => Int, {
    nullable: true,
    description: 'Percentage of the data used for prediction, from 1 to 99. Default 20.',
  })
  @prop({ type: () => Number, default: 20 })
  predictDataPercent?: number;
}
