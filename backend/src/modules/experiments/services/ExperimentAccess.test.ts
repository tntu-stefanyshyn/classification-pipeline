import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { Types } from 'mongoose';

import { PipelineBaseService } from '../../../core/pipeline';
import { createLeanResult, stub } from '../../../test/testUtils';
import { ExperimentModel } from '../models/ExperimentModel';
import { ExperimentAccess } from './ExperimentAccess';

// The ownership rules take who is asking, so these tests need no HTTP request.
const ownerId = new Types.ObjectId();
const strangerId = new Types.ObjectId();
const experimentId = new Types.ObjectId();
const pipelineId = new Types.ObjectId();

const stubData = (t: TestContext) => {
  const reads: string[] = [];
  const owns = (query: any) =>
    String(query._id) === String(experimentId) && String(query.createdById) === String(ownerId);
  stub(t, ExperimentModel as unknown as Record<string, unknown>, 'findOne', (query: any) => {
    reads.push('experiment');
    return createLeanResult(owns(query) ? { _id: experimentId } : null);
  });
  stub(t, ExperimentModel as unknown as Record<string, unknown>, 'exists', async (query: any) => {
    reads.push('exists');
    return owns(query) ? { _id: experimentId } : null;
  });
  stub(
    t,
    PipelineBaseService as unknown as Record<string, unknown>,
    'getById',
    async (id: unknown) => {
      reads.push('pipeline');
      if (String(id) !== String(pipelineId)) throw new Error('Конвеєр не знайдено');
      return { _id: pipelineId, experimentId };
    }
  );
  return reads;
};

test('assertExperimentOwner accepts the owner and rejects anyone else', async (t) => {
  stubData(t);
  const access = new ExperimentAccess();

  await access.assertExperimentOwner(ownerId, experimentId);
  await access.assertExperimentOwner(ownerId.toHexString(), experimentId);
  await assert.rejects(
    () => access.assertExperimentOwner(strangerId, experimentId),
    /Експеремент не знайдено/
  );
});

test('assertPipelineOwner checks the experiment of the pipeline', async (t) => {
  stubData(t);
  const access = new ExperimentAccess();

  await access.assertPipelineOwner(ownerId, pipelineId);
  await assert.rejects(
    () => access.assertPipelineOwner(strangerId, pipelineId),
    /Конвеєр не знайдено/
  );
  // A missing pipeline and a pipeline of another user give the same error.
  await assert.rejects(
    () => access.assertPipelineOwner(ownerId, new Types.ObjectId()),
    /Конвеєр не знайдено/
  );
});

test('the service principal passes without reading ownership data', async (t) => {
  const reads = stubData(t);
  const access = new ExperimentAccess();

  await access.assertExperimentAccess({ kind: 'service' }, experimentId);
  await access.assertPipelineAccess({ kind: 'service' }, pipelineId);

  assert.deepEqual(reads, []);
});

test('a user principal gets the ownership checks', async (t) => {
  stubData(t);
  const access = new ExperimentAccess();
  const owner = { kind: 'user', userId: ownerId } as const;
  const stranger = { kind: 'user', userId: strangerId } as const;

  await access.assertExperimentAccess(owner, experimentId);
  await access.assertPipelineAccess(owner, pipelineId);
  await assert.rejects(
    () => access.assertExperimentAccess(stranger, experimentId),
    /Експеремент не знайдено/
  );
  await assert.rejects(
    () => access.assertPipelineAccess(stranger, pipelineId),
    /Конвеєр не знайдено/
  );
});
