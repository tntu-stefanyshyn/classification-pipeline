import { getModelForClass } from '@typegoose/typegoose';

import { Workflow } from '../classes/Workflow';

export const workflowsCollectionName = 'workflows';

export const WorkflowModel = getModelForClass(Workflow, {
  schemaOptions: { collection: workflowsCollectionName },
});
