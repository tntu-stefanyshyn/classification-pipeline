import { prop } from '@typegoose/typegoose';
import { Field, ObjectType } from 'type-graphql';
import { WorkflowStatus, workflowStatusEnum } from '../enums';

@ObjectType({ description: 'One status change of a workflow.' })
export class WorkflowHistoryItem {
  @prop({ required: true, enum: workflowStatusEnum, type: String })
  previousStatus!: WorkflowStatus;

  @prop({ required: false, enum: workflowStatusEnum, type: String })
  nextStatus?: WorkflowStatus;

  @Field(() => String, { nullable: true, description: 'Note written with the change.' })
  @prop({ required: false, type: String })
  message?: string;

  @Field(() => Date, { description: 'When the status changed.' })
  @prop({ type: () => Date })
  createdAt!: Date;
}
