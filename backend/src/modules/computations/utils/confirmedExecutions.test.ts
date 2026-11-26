import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PipelineStatus } from '../../../core/pipeline/enums';
import { confirmedExecutions, isConfirmedExecution } from './confirmedExecutions';

const seen = (status: PipelineStatus, executionId: string | null, admissionId?: string | null) =>
  confirmedExecutions([{ pipelineId: 'run', executionId, status, admissionId }]);

test('a run still in the admission and execution the user saw is the confirmed run', () => {
  assert.equal(
    isConfirmedExecution(
      seen(PipelineStatus.running, '3', 'A'),
      'run',
      PipelineStatus.running,
      3,
      'A'
    ),
    true
  );
});

test('a worker taking the queued admission the user saw is still the confirmed run', () => {
  assert.equal(
    isConfirmedExecution(
      seen(PipelineStatus.queued, '3', 'A'),
      'run',
      PipelineStatus.running,
      4,
      'A'
    ),
    true
  );
});

test('a run queued again since the confirmation is a different request, even in the same execution', () => {
  // Stopped and queued again by another client: execution 3 still, but a new admission.
  assert.equal(
    isConfirmedExecution(
      seen(PipelineStatus.queued, '3', 'A'),
      'run',
      PipelineStatus.queued,
      3,
      'B'
    ),
    false
  );
  // ... and then taken by a worker.
  assert.equal(
    isConfirmedExecution(
      seen(PipelineStatus.queued, '3', 'A'),
      'run',
      PipelineStatus.running,
      4,
      'B'
    ),
    false
  );
});

test('a restarted execution is a different run', () => {
  assert.equal(
    isConfirmedExecution(
      seen(PipelineStatus.running, '3', 'A'),
      'run',
      PipelineStatus.running,
      4,
      'A'
    ),
    false
  );
});

test('without an admission id (older clients) only the execution is compared', () => {
  assert.equal(
    isConfirmedExecution(seen(PipelineStatus.queued, '3'), 'run', PipelineStatus.queued, 3, 'B'),
    true
  );
  assert.equal(
    isConfirmedExecution(seen(PipelineStatus.idle, null), 'other', PipelineStatus.idle, undefined),
    false
  );
});

test('a run seen without an admission and queued again since is a different request', () => {
  // Queued before admissions existed, so the desktop sent `null`; queued again it has one now.
  assert.equal(
    isConfirmedExecution(
      seen(PipelineStatus.queued, '3', null),
      'run',
      PipelineStatus.queued,
      3,
      'B'
    ),
    false
  );
  assert.equal(
    isConfirmedExecution(seen(PipelineStatus.queued, '3', null), 'run', PipelineStatus.queued, 3),
    true
  );
});
