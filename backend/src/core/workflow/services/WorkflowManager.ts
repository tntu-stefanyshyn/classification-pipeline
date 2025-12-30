import { Transitions } from './WorkflowManager.types.';
import { WorkflowModel } from '../model/WorkflowModel';
import { ObjectIdOrSting } from '../../../types/context';
import { WorkflowStatus, WorkflowType } from '../enums';

export class WorkflowManager {
  getWorkflow = async ({
    type,
    workflowId,
  }: {
    workflowId: ObjectIdOrSting;
    type: WorkflowType;
  }) => {
    const workflow = await WorkflowModel.findOne({ _id: workflowId, type }).lean();
    if (!workflow) throw new Error('Робочий процес не знайдено');
    return workflow;
  };

  changeStatus = async <T extends WorkflowStatus>({
    transitions,
    instanceId,
    status,
    type,
  }: {
    transitions: Transitions<T>;
    instanceId: ObjectIdOrSting;
    type: WorkflowType;
    status: T;
  }) => {
    const workflow = await this.getWorkflow({ workflowId: instanceId, type });
    const transition = transitions.find(
      (transition) => transition.from === workflow.status && transition.to === status
    );

    await transition?.sideEffect?.({ instanceId });
  };
}
