import { getModelForClass } from '@typegoose/typegoose';

import { Workflow } from '../classes/Workflow';

export const workflowsCollectionName = 'workflows';

export const WorkflowModel = getModelForClass(Workflow, {
  schemaOptions: { collection: workflowsCollectionName },
});

// Not declared on `Workflow`, so the backend does not wait for them at startup. Not unique:
// `getWorkflow` sorts by `createdAt`, and a unique build would fail on a database with duplicates.
export const createWorkflowReadIndexes = () =>
  WorkflowModel.collection.createIndexes([
    // Status reads by instance (`getWorkflow`, the `$lookup` from pipelines).
    { key: { instanceId: 1, type: 1 } },
    // The `$match` of the `claimNextRun` aggregation and the queue summaries.
    { key: { type: 1, status: 1 } },
  ]);
