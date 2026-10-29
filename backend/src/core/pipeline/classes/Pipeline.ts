import { prop } from '@typegoose/typegoose';
import { TimeStamps } from '@typegoose/typegoose/lib/defaultClasses';
import { Types } from 'mongoose';
import { Field, Float, ID, Int, ObjectType } from 'type-graphql';
import { ComputationQueue } from '../../../modules/computations/classes/ComputationQueue';
import { PipelineMachineInfo } from './PipelineMachineInfo';
import { ComputationResultPayload } from '../../../modules/computations/classes/ComputationResultPayload';
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

  @Field(() => Float, { nullable: true })
  @prop({ min: 0, max: 100 })
  progress?: number;

  @Field({ nullable: true })
  @prop({ trim: true })
  statusMessage?: string;

  @Field(() => [PipelineHistoryItem])
  @prop({ _id: false, type: () => [PipelineHistoryItem], default: [] })
  history!: PipelineHistoryItem[];

  @Field(() => PipelineMachineInfo, { nullable: true })
  @prop({ _id: false, type: () => PipelineMachineInfo })
  machineInfo?: PipelineMachineInfo;

  @Field(() => ComputationResultPayload, { nullable: true })
  @prop({ _id: false, type: () => ComputationResultPayload })
  computingResult?: ComputationResultPayload;

  @Field(() => [Float], { nullable: true })
  @prop({ type: () => [Number], default: [] })
  optimizationScores?: number[];

  @prop({ min: 0, default: 0 })
  priority?: number;

  /**
   * Execution fence: the number of the latest execution a claim started. It is raised before the
   * claim's status change, so reports carrying an older number are rejected by their update filter.
   */
  @Field(() => ID, { nullable: true })
  @prop({ type: () => Number })
  executionId?: number;

  @prop({ trim: true })
  cloudJobId?: string;

  @Field(() => Date)
  declare createdAt: Date;

  @Field(() => Date)
  declare updatedAt: Date;
}
