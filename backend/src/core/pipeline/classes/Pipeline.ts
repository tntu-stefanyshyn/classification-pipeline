import { prop } from '@typegoose/typegoose';
import { TimeStamps } from '@typegoose/typegoose/lib/defaultClasses';
import { Types } from 'mongoose';
import { Field, ID, Int, ObjectType } from 'type-graphql';
import { ComputationQueue } from '../../../modules/computations/classes/ComputationQueue';
import { PipelineMachineInfo } from './PipelineMachineInfo';
import { PipelineHistoryItem } from './PipelineHistoryItem';

@ObjectType()
export class Pipeline extends TimeStamps {
  @Field(() => ID)
  _id!: Types.ObjectId;

  @Field(() => ID)
  @prop({ required: true, index: true, type: () => Types.ObjectId })
  experimentId!: Types.ObjectId;

  @Field(() => ID)
  @prop({ required: true, index: true, type: () => Types.ObjectId })
  graphStructureId!: Types.ObjectId;

  @Field(() => ComputationQueue)
  @prop({ required: true, enum: ComputationQueue, type: () => String })
  queue!: ComputationQueue;

  @Field(() => [ID])
  @prop({ required: true, type: () => [Types.ObjectId] })
  pathNodeIds!: Types.ObjectId[];

  @Field(() => Int, { nullable: true })
  @prop({ min: 0, max: 100 })
  progress?: number;

  @Field({ nullable: true })
  @prop({ trim: true })
  statusMessage?: string;

  @Field(() => [PipelineHistoryItem])
  @prop({ _id: false, type: () => [PipelineHistoryItem], default: [] })
  history!: PipelineHistoryItem[];

  @prop({ _id: false, type: () => PipelineMachineInfo })
  machineInfo?: PipelineMachineInfo;

  @prop({ min: 0, default: 0 })
  priority?: number;

  @prop({ trim: true })
  cloudJobId?: string;

  @Field(() => Date)
  declare createdAt: Date;

  @Field(() => Date)
  declare updatedAt: Date;
}
