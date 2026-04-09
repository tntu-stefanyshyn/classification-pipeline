import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Types } from 'mongoose';

import { ExperimentStatus } from '../../modules/experiments/classes/ExperimentStatus';
import { PipelineStatus } from '../pipeline/enums';
import { Workflow } from './classes/Workflow';
import { WorkflowHistoryItem } from './classes/WorkflowHistoryItem';
import { workflowStatusEnum, WorkflowType } from './enums';
import { WorkflowModel, workflowsCollectionName } from './model/WorkflowModel';
import { stub } from '../../test/testUtils';
import { WorkflowManager } from './services/WorkflowManager';

test('core workflow classes and enums keep assigned values', async () => {
  const workflow = new Workflow();
  const historyItem = new WorkflowHistoryItem();
  const now = new Date();

  workflow._id = new Types.ObjectId();
  workflow.type = WorkflowType.PIPELINE;
  workflow.instanceId = new Types.ObjectId();
  workflow.status = PipelineStatus.running;
  workflow.history = [];
  workflow.createdAt = now;

  historyItem.previousStatus = ExperimentStatus.creating;
  historyItem.nextStatus = ExperimentStatus.configuring;
  historyItem.message = 'Transition';
  historyItem.createdAt = now;

  assert.ok(workflowStatusEnum.includes(ExperimentStatus.completed));
  assert.ok(workflowStatusEnum.includes(PipelineStatus.completed));
  assert.equal(workflowsCollectionName, 'workflows');
  assert.equal(WorkflowModel.modelName, 'Workflow');
  assert.equal(workflow.type, WorkflowType.PIPELINE);
  assert.equal(historyItem.nextStatus, ExperimentStatus.configuring);
});

test('WorkflowManager.getWorkflow forwards filters to the model query', async (t) => {
  const manager = new WorkflowManager();
  const sortCalls: any[] = [];
  const expected = { _id: new Types.ObjectId(), status: PipelineStatus.idle };

  stub(t, WorkflowModel as unknown as Record<string, unknown>, 'findOne', (query: any) => {
    assert.deepEqual(query, {
      instanceId: 'pipeline-1',
      status: PipelineStatus.idle,
      type: WorkflowType.PIPELINE,
    });
    return {
      sort(sortBy: any) {
        sortCalls.push(sortBy);
        return {
          lean: async () => expected,
        };
      },
    };
  });

  const result = await manager.getWorkflow({
    instanceId: 'pipeline-1',
    status: PipelineStatus.idle,
    type: WorkflowType.PIPELINE,
  });

  assert.equal(result, expected);
  assert.deepEqual(sortCalls, [{ createdAt: -1 }]);
});

test('WorkflowManager.getWorkflow rejects missing workflows', async (t) => {
  const manager = new WorkflowManager();

  stub(t, WorkflowModel as unknown as Record<string, unknown>, 'findOne', () => ({
    sort: () => ({
      lean: async () => null,
    }),
  }));

  await assert.rejects(
    () => manager.getWorkflow({ type: WorkflowType.EXPERIMENT }),
    /Робочий процес не знайдено/
  );
});

test('WorkflowManager.create seeds initial history and returns plain object', async (t) => {
  const manager = new WorkflowManager();
  const createCalls: any[] = [];
  const workflowId = new Types.ObjectId();

  stub(t, WorkflowModel as unknown as Record<string, unknown>, 'create', async (payload: any) => {
    createCalls.push(payload);
    return {
      toObject: ({ getters }: { getters: boolean }) => ({
        getters,
        _id: workflowId,
        ...payload,
      }),
    };
  });

  const result: any = await manager.create({
    instanceId: workflowId,
    status: ExperimentStatus.creating,
    type: WorkflowType.EXPERIMENT,
  });

  assert.equal(createCalls.length, 1);
  assert.equal(createCalls[0].instanceId, workflowId);
  assert.equal(createCalls[0].history.length, 1);
  assert.equal(createCalls[0].history[0].previousStatus, ExperimentStatus.creating);
  assert.equal(result.getters, true);
});
