import { prop } from '@typegoose/typegoose';
import { TimeStamps } from '@typegoose/typegoose/lib/defaultClasses';
import { Types } from 'mongoose';
import { Field, ID, ObjectType } from 'type-graphql';
import { WorkflowHistoryItem } from './WorkflowHistoryItem';
import { WorkflowStatus, workflowStatusEnum, WorkflowType } from '../enums';

@ObjectType()
export class Workflow extends TimeStamps {
  @Field(() => ID)
  _id!: Types.ObjectId;

  @Field(() => WorkflowType)
  @prop({ required: true, enum: WorkflowType, type: String })
  type!: WorkflowType;

  @Field()
  @prop({ required: true, trim: true, type: () => Types.ObjectId })
  instanceId!: Types.ObjectId;

  @Field(() => String)
  @prop({ required: true, enum: workflowStatusEnum, type: String })
  status!: WorkflowStatus;

  @Field(() => [WorkflowHistoryItem], { nullable: true })
  @prop({ type: () => [WorkflowHistoryItem], required: true, default: [] })
  history!: WorkflowHistoryItem[];

  @Field(() => Date)
  declare createdAt: Date;
}
