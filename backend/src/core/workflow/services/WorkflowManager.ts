import { Transitions } from './WorkflowManager.types.';
import { WorkflowModel } from '../model/WorkflowModel';
import { ObjectIdOrString } from '../../../types/context';
import { WorkflowStatus, WorkflowType } from '../enums';
import { Workflow } from '../classes/Workflow';

export class WorkflowManager {
  getWorkflow = async ({
    type,
    instanceId,
  }: {
    instanceId: ObjectIdOrString;
    type: WorkflowType;
  }) => {
    const workflow = await WorkflowModel.findOne({ instanceId, type }).lean();
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
  }: {
    transitions: Transitions<T>;
    instanceId: ObjectIdOrString;
    type: WorkflowType;
    status: T;
  }) => {
    const workflow = await this.getWorkflow({ instanceId, type });
    const transition = transitions.find(
      (transition) => transition.from === workflow.status && transition.to === status
    );
    if (!transition) throw new Error('Неможливо виконати перехід');

    await WorkflowModel.updateOne(
      { _id: workflow._id },
      {
        $set: { status },
        $push: {
          history: { previousStatus: workflow.status, nextStatus: status, createdAt: new Date() },
        },
      }
    );
    await transition?.sideEffect?.({ instanceId });
  };
}
