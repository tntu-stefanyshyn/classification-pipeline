import { prop } from '@typegoose/typegoose';
import { Field, ObjectType } from 'type-graphql';
import { WorkflowStatus, workflowStatusEnum } from '../enums';

@ObjectType()
export class WorkflowHistoryItem {
  @prop({ required: true, enum: workflowStatusEnum, type: String })
  previousStatus!: WorkflowStatus;

  @prop({ required: false, enum: workflowStatusEnum, type: String })
  nextStatus?: WorkflowStatus;

  @Field(() => String, { nullable: true })
  @prop({ required: false, type: String })
  message?: string;

  @Field(() => Date)
  @prop({ type: () => Date })
  createdAt!: Date;
}
