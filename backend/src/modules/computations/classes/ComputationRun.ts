import { prop } from '@typegoose/typegoose';
import { TimeStamps } from '@typegoose/typegoose/lib/defaultClasses';
import { Types } from 'mongoose';
import { Field, ID, Int, ObjectType } from 'type-graphql';
import { ComputationQueue } from './ComputationQueue';
import { ComputationStatus } from './ComputationStatus';
import { ComputationMachineInfo } from './ComputationMachineInfo';
import { ComputationHistoryEntry } from './ComputationHistoryEntry';

@ObjectType()
export class ComputationRun extends TimeStamps {
  @Field(() => ID)
  _id!: Types.ObjectId;

  @Field(() => ID)
  @prop({ required: true, index: true, type: () => Types.ObjectId })
  experimentId!: Types.ObjectId;

  @Field(() => ComputationQueue)
  @prop({ required: true, enum: ComputationQueue, type: () => String })
  queue!: ComputationQueue;

  @Field(() => ComputationStatus)
  @prop({
    required: true,
    enum: ComputationStatus,
    type: () => String,
    default: ComputationStatus.queued,
  })
  status!: ComputationStatus;

  @Field(() => [ID])
  @prop({ required: true, type: () => [Types.ObjectId] })
  pathNodeIds!: Types.ObjectId[];

  @Field(() => Int, { nullable: true })
  @prop({ min: 0, max: 100 })
  progress?: number;

  @Field({ nullable: true })
  @prop({ trim: true })
  statusMessage?: string;

  @Field(() => [ComputationHistoryEntry])
  @prop({ _id: false, type: () => [ComputationHistoryEntry], default: [] })
  history!: ComputationHistoryEntry[];

  @prop({ _id: false, type: () => ComputationMachineInfo })
  machineInfo?: ComputationMachineInfo;

  @prop({ min: 0, default: 0 })
  priority?: number;

  @prop({ trim: true })
  cloudJobId?: string;

  @Field(() => Date)
  declare createdAt: Date;

  @Field(() => Date)
  declare updatedAt: Date;
}
