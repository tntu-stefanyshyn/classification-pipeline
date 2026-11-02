import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PipelineStatus } from '../src/graphql/types.generated';
import { isCurrentExecution } from '../src/workers/localComputation/currentExecution';
import { claimExperimentRun } from '../src/workers/localComputation/graphqlOperations';

test('isCurrentExecution notices a newer execution even though the run is still running', () => {
  assert.equal(isCurrentExecution({ status: PipelineStatus.running, executionId: '3' }, '3'), true);
  // Stopped, queued and claimed again between two polls: still `running`, but not ours.
  assert.equal(
    isCurrentExecution({ status: PipelineStatus.running, executionId: '4' }, '3'),
    false
  );
  assert.equal(isCurrentExecution({ status: PipelineStatus.idle, executionId: '3' }, '3'), false);
  assert.equal(isCurrentExecution({ status: PipelineStatus.queued, executionId: '3' }, '3'), false);
});

test('claimExperimentRun refuses a claim that comes without an executionId', async () => {
  const client = (run: unknown) => ({ request: async () => ({ claimExperimentRun: run }) }) as any;
  const queue = 'local' as any;

  assert.equal(await claimExperimentRun(client(null), queue), null);
  assert.equal((await claimExperimentRun(client({ executionId: '2' }), queue))?.executionId, '2');
  await assert.rejects(
    () => claimExperimentRun(client({ executionId: null }), queue),
    /executionId/
  );
});
