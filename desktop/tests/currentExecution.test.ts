import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PipelineStatus } from '../src/graphql/types.generated';
import { isCurrentExecution } from '../src/workers/localComputation/currentExecution';

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

test('isCurrentExecution keeps the status-only check for a backend without executionId', () => {
  assert.equal(
    isCurrentExecution({ status: PipelineStatus.running, executionId: null }, null),
    true
  );
  assert.equal(
    isCurrentExecution({ status: PipelineStatus.running, executionId: '1' }, null),
    false
  );
});
