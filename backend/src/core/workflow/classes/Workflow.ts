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
// The workflow of a re-run is created with `rerun: true` by an atomic get-or-create, so the request
// and a recovery cannot both insert it. Only those documents are in this index, so existing data
// cannot make it fail to build.
@index({ instanceId: 1 }, { unique: true, partialFilterExpression: { rerun: true } })
// Declare only what must exist before the backend starts: `WorkflowModel.init()` waits for every
// index declared here. Read indexes go to `createWorkflowReadIndexes` so they build in the background.
@ObjectType({ description: 'The status of an experiment or a pipeline with its history.' })
export class Workflow extends TimeStamps {
  @Field(() => ID, { description: 'Id of the workflow document.' })
  _id!: Types.ObjectId;

  @Field(() => WorkflowType, { description: 'Whether it tracks an experiment or a pipeline.' })
  @prop({ required: true, enum: WorkflowType, type: String })
  type!: WorkflowType;

  @Field(() => ID, { description: 'Id of the experiment or the pipeline.' })
  @prop({ required: true, type: () => Types.ObjectId })
  instanceId!: ObjectIdOrString;

  @Field(() => String, {
    description: 'Current status (an `ExperimentStatus` or a `PipelineStatus` value).',
  })
  @prop({ required: true, enum: workflowStatusEnum, type: String })
  status!: WorkflowStatus;

  @Field(() => [WorkflowHistoryItem], {
    nullable: true,
    description: 'Status changes, oldest first.',
  })
  @prop({ type: () => [WorkflowHistoryItem], required: true, default: [] })
  history!: WorkflowHistoryItem[];

  @prop({ type: () => String })
  machineHostname?: string;

  /** Set on the workflow of a re-run; see the unique index above. */
  @prop({ type: () => Boolean })
  rerun?: boolean;

  /** Id of the pipeline's current queue admission: new on every move to `queued`. */
  @prop({ type: () => String })
  admissionId?: string;

  /** Number of the pipeline's current execution, set by the claim that starts it. */
  @prop({ type: () => Number })
  executionId?: number;

  @Field(() => Date, { description: 'When the workflow was created.' })
  declare createdAt: Date;
}
