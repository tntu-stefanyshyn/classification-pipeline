import { prop } from '@typegoose/typegoose';
import { Types } from 'mongoose';
import { Field, Float, ID, ObjectType } from 'type-graphql';
import { OptimizationHistoryItem } from './OptimizationHistoryItem';
import { OptimizationStatus } from './OptimizationStatus';

@ObjectType({ description: 'State and result of the optimization of an experiment.' })
export class ExperimentOptimization {
  @Field(() => Float, { nullable: true, description: 'Progress of the optimization in percent.' })
  @prop({ min: 0, max: 100 })
  progress?: number;

  @Field(() => [OptimizationHistoryItem], {
    nullable: true,
    description: 'Messages and status changes of the optimization, oldest first.',
  })
  @prop({ _id: false, type: () => [OptimizationHistoryItem], default: [] })
  history?: OptimizationHistoryItem[];

  @Field(() => OptimizationStatus, { nullable: true, description: 'Status of the optimization.' })
  @prop({ enum: OptimizationStatus, type: () => String })
  status?: OptimizationStatus;

  @Field(() => ID, {
    nullable: true,
    description: 'Id of the best pipeline, once the optimization has finished.',
  })
  @prop({ type: () => Types.ObjectId })
  bestPipelineId?: Types.ObjectId;

  @Field({
    nullable: true,
    description: 'Integral score of the best pipeline. A lower score is better.',
  })
  @prop()
  bestScore?: number;

  /** The attempt that holds `optimizing`: only it may undo or release the optimization. */
  @prop()
  attemptId?: string;
}
