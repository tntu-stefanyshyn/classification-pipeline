import { prop } from '@typegoose/typegoose';
import { Types } from 'mongoose';
import { Field, Float, ID, ObjectType } from 'type-graphql';
import { OptimizationHistoryItem } from './OptimizationHistoryItem';
import { OptimizationStatus } from './OptimizationStatus';

@ObjectType()
export class ExperimentOptimization {
  @Field(() => Float, { nullable: true })
  @prop({ min: 0, max: 100 })
  progress?: number;

  @Field(() => [OptimizationHistoryItem], { nullable: true })
  @prop({ _id: false, type: () => [OptimizationHistoryItem], default: [] })
  history?: OptimizationHistoryItem[];

  @Field(() => OptimizationStatus, { nullable: true })
  @prop({ enum: OptimizationStatus, type: () => String })
  status?: OptimizationStatus;

  @Field(() => ID, { nullable: true })
  @prop({ type: () => Types.ObjectId })
  bestPipelineId?: Types.ObjectId;

  @Field({ nullable: true })
  @prop()
  bestScore?: number;
}
