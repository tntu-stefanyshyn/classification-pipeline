import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Types } from 'mongoose';

import { ExperimentStatus } from '../../../modules/experiments/classes/ExperimentStatus';
import { WorkflowType } from '../enums';
import { WorkflowModel } from '../model/WorkflowModel';
import { stub } from '../../../test/testUtils';
import { WorkflowManager } from './WorkflowManager';

test('WorkflowManager.changeStatus updates status history and runs side effects', async (t) => {
  const manager = new WorkflowManager();
  const workflowId = new Types.ObjectId();
  const experimentId = new Types.ObjectId();
  const updateCalls: any[] = [];
  const sideEffects: Types.ObjectId[] = [];

  stub(t, manager as unknown as Record<string, unknown>, 'getWorkflow', async () => ({
    _id: workflowId,
    status: ExperimentStatus.creating,
  }));
  stub(
    t,
    WorkflowModel as unknown as Record<string, unknown>,
    'updateOne',
    async (...args: any[]) => {
      updateCalls.push(args);
      return {};
    }
  );

  await manager.changeStatus({
    instanceId: experimentId,
    status: ExperimentStatus.configuring,
    type: WorkflowType.EXPERIMENT,
    transitions: [
      {
        from: ExperimentStatus.creating,
        to: ExperimentStatus.configuring,
        sideEffect: async ({ instanceId }) => {
          sideEffects.push(instanceId as Types.ObjectId);
        },
      },
    ],
  });

  assert.equal(updateCalls.length, 1);
  assert.deepEqual(updateCalls[0][0], { _id: workflowId });
  assert.equal(updateCalls[0][1].$set.status, ExperimentStatus.configuring);
  assert.equal(
    updateCalls[0][1].$push.history.message,
    `Перехід статусу: ${ExperimentStatus.creating} -> ${ExperimentStatus.configuring}`
  );
  assert.deepEqual(sideEffects, [experimentId]);
});

test('WorkflowManager.changeStatus trims explicit messages', async (t) => {
  const manager = new WorkflowManager();
  const updateCalls: any[] = [];

  stub(t, manager as unknown as Record<string, unknown>, 'getWorkflow', async () => ({
    _id: new Types.ObjectId(),
    status: ExperimentStatus.configuring,
  }));
  stub(
    t,
    WorkflowModel as unknown as Record<string, unknown>,
    'updateOne',
    async (...args: any[]) => {
      updateCalls.push(args);
      return {};
    }
  );

  await manager.changeStatus({
    instanceId: new Types.ObjectId(),
    status: ExperimentStatus.computing,
    type: WorkflowType.EXPERIMENT,
    message: '  Launching pipelines  ',
    transitions: [
      {
        from: ExperimentStatus.configuring,
        to: ExperimentStatus.computing,
      },
    ],
  });

  assert.equal(updateCalls[0][1].$push.history.message, 'Launching pipelines');
});

test('WorkflowManager.changeStatus rejects unsupported transitions', async (t) => {
  const manager = new WorkflowManager();

  stub(t, manager as unknown as Record<string, unknown>, 'getWorkflow', async () => ({
    _id: new Types.ObjectId(),
    status: ExperimentStatus.creating,
  }));

  await assert.rejects(
    () =>
      manager.changeStatus({
        instanceId: new Types.ObjectId(),
        status: ExperimentStatus.completed,
        type: WorkflowType.EXPERIMENT,
        transitions: [
          {
            from: ExperimentStatus.creating,
            to: ExperimentStatus.configuring,
          },
        ],
      }),
    /TRANSITION_NOT_FOUND/
  );
});
