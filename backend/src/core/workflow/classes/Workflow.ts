import { prop } from '@typegoose/typegoose';
import { TimeStamps } from '@typegoose/typegoose/lib/defaultClasses';
import { Types } from 'mongoose';
import { Field, ID, ObjectType } from 'type-graphql';
import { WorkflowHistoryItem } from './WorkflowHistoryItem';
import { WorkflowStatus, workflowStatusEnum, WorkflowType } from '../enums';
import { ObjectIdOrString } from '../../../types/context';

@ObjectType()
export class Workflow extends TimeStamps {
  @Field(() => ID)
  _id!: Types.ObjectId;

  @Field(() => WorkflowType)
  @prop({ required: true, enum: WorkflowType, type: String })
  type!: WorkflowType;

  @Field(() => ID)
  @prop({ required: true, type: () => Types.ObjectId })
  instanceId!: ObjectIdOrString;

  @Field(() => String)
  @prop({ required: true, enum: workflowStatusEnum, type: String })
  status!: WorkflowStatus;

  @Field(() => [WorkflowHistoryItem], { nullable: true })
  @prop({ type: () => [WorkflowHistoryItem], required: true, default: [] })
  history!: WorkflowHistoryItem[];

  @Field(() => Date)
  declare createdAt: Date;
}
