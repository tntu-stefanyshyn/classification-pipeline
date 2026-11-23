import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { Types } from 'mongoose';

import { WorkflowModel } from '../../core/workflow/model/WorkflowModel';
import { stub } from '../../test/testUtils';
import { ExperimentStatus } from './classes/ExperimentStatus';
import { ExperimentManager } from './services/ExperimentManager';

// The status change runs the transition's side effect, as WorkflowManager.changeStatus does.
const setup = (t: TestContext, filesOk: boolean[]) => {
  const manager = new ExperimentManager() as any;
  const reverts: any[] = [];
  let checks = 0;
  stub(t, manager, 'ensureExperimentFileReady', async () => {
    const ok = filesOk[checks] ?? true;
    checks += 1;
    if (!ok) throw new Error('Файл експерименту не знайдено або він недоступний для обчислень.');
  });
  stub(
    t,
    WorkflowModel as unknown as Record<string, unknown>,
    'updateOne',
    async (...args: any[]) => {
      reverts.push(args);
    }
  );
  stub(t, manager.workflowManager, 'changeStatus', async (payload: any) => {
    const transition = payload.transitions.find(
      (entry: any) =>
        entry.from === ExperimentStatus.completed && entry.to === ExperimentStatus.computing
    );
    await transition.sideEffect({ instanceId: payload.instanceId });
    return true;
  });
  return { manager, reverts, checks: () => checks };
};

test('reopening a completed experiment checks the file again after the status write', async (t) => {
  const { manager, reverts, checks } = setup(t, [true, true]);

  await manager.changeStatus({
    experimentId: new Types.ObjectId(),
    status: ExperimentStatus.computing,
  });

  assert.equal(checks(), 2);
  assert.equal(reverts.length, 0);
});

test('a file deleted between the check and the status write puts the experiment back to completed', async (t) => {
  // The first check passes, then a deletion takes its lease; the re-check after the write fails.
  const { manager, reverts } = setup(t, [true, false]);

  await assert.rejects(
    () =>
      manager.changeStatus({
        experimentId: new Types.ObjectId(),
        status: ExperimentStatus.computing,
      }),
    /недоступний/
  );

  assert.equal(reverts.length, 1);
  assert.equal(reverts[0][1].$set.status, ExperimentStatus.completed);
  assert.equal(reverts[0][0].status, ExperimentStatus.computing);
});
