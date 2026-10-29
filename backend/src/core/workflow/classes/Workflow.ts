import { index, prop } from '@typegoose/typegoose';
import { TimeStamps } from '@typegoose/typegoose/lib/defaultClasses';
import { Types } from 'mongoose';
import { Field, ID, ObjectType } from 'type-graphql';
import { WorkflowHistoryItem } from './WorkflowHistoryItem';
import { WorkflowStatus, workflowStatusEnum, WorkflowType } from '../enums';
import { ObjectIdOrString } from '../../../types/context';
import { PipelineStatus } from '../../pipeline/enums';

// One running local run per machine: the claim sets the hostname in the same update that moves the
// run to `running`, and the run leaves this index in the update that moves it out of `running`.
@index(
  { machineHostname: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: WorkflowType.PIPELINE,
      status: PipelineStatus.running,
      machineHostname: { $exists: true },
    },
  }
)
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

  @prop({ type: () => String })
  machineHostname?: string;

  /** Number of the pipeline's current execution, set by the claim that starts it. */
  @prop({ type: () => Number })
  executionId?: number;

  @Field(() => Date)
  declare createdAt: Date;
}
