import { Transitions } from './WorkflowManager.types.';
import { WorkflowModel } from '../model/WorkflowModel';
import { ObjectIdOrString } from '../../../types/context';
import { WorkflowStatus, WorkflowType } from '../enums';
import { Workflow } from '../classes/Workflow';
import { SortOrder } from 'mongoose';

export class WorkflowManager {
  getWorkflow = async <T>({
    type,
    instanceId,
    sortBy = { createdAt: -1 },
    status,
  }: {
    instanceId?: ObjectIdOrString;
    status?: T;
    type: WorkflowType;
    sortBy?: Record<string, SortOrder>;
  }) => {
    const workflow = await WorkflowModel.findOne({
      ...(instanceId ? { instanceId } : {}),
      ...(status ? { status } : {}),
      type,
    })
      .sort(sortBy)
      .lean();
    if (!workflow) throw new Error('Робочий процес не знайдено');
    return workflow;
  };

  create = async ({
    type,
    instanceId,
    status,
  }: Pick<Workflow, 'status' | 'instanceId' | 'type'>) => {
    const workflow = await WorkflowModel.create({
      instanceId,
      status,
      type,
      history: [{ previousStatus: status, createdAt: new Date() }],
    });
    return workflow.toObject({ getters: true });
  };

  changeStatus = async <T extends WorkflowStatus>({
    transitions,
    instanceId,
    status,
    type,
    message,
  }: {
    transitions: Transitions<T>;
    instanceId: ObjectIdOrString;
    type: WorkflowType;
    status: T;
    message?: string;
  }) => {
    const workflow = await this.getWorkflow({ instanceId, type });
    const transition = transitions.find(
      (transition) => transition.from === workflow.status && transition.to === status
    );
    if (!transition) throw new Error('TRANSITION_NOT_FOUND');
    const normalizedMessage =
      typeof message === 'string' && message.trim()
        ? message.trim()
        : `Перехід статусу: ${String(workflow.status)} -> ${String(status)}`;

    await WorkflowModel.updateOne(
      { _id: workflow._id },
      {
        $set: { status },
        $push: {
          history: {
            previousStatus: workflow.status,
            nextStatus: status,
            message: normalizedMessage,
            createdAt: new Date(),
          },
        },
      }
    );
    await transition?.sideEffect?.({ instanceId });
  };
}
