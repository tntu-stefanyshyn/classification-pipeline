import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import mongoose, { Types } from 'mongoose';

import { config } from '../config/config';
import { PipelineStatus } from '../core/pipeline/enums';
import { PipelineResolver } from '../core/pipeline/graphql/pipeline';
import { PipelineModel } from '../core/pipeline/models/PipelineModel';
import { WorkflowType } from '../core/workflow/enums';
import { WorkflowModel } from '../core/workflow/model/WorkflowModel';
import { buildGraphqlSchema, createGraphqlContext, executeGraphql } from '../test/graphqlTestUtils';
import { pipelineHistoryMissingStatusMigration } from './pipelineHistoryMissingStatusMigration';

// The `status: null` filter and the array filter only behave as intended against a real MongoDB.
const uri = process.env.MONGODB_TEST_URI;
const skip = uri ? false : 'MONGODB_TEST_URI is not set';

const useDatabase = async (t: TestContext) => {
  await mongoose.connect(uri!, { dbName: `history-test-${process.pid}-${Date.now()}` });
  t.after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
};

const insertPipeline = async (history: Record<string, unknown>[]) => {
  const _id = new Types.ObjectId();
  // Raw insert: the entries must look exactly like the ones stored before the fix.
  await PipelineModel.collection.insertOne({
    _id,
    experimentId: new Types.ObjectId(),
    graphStructureId: new Types.ObjectId(),
    queue: 'local',
    pathNodeIds: [],
    executionId: 1,
    history,
  });
  return _id;
};

const statusesOf = async (pipelineId: Types.ObjectId) => {
  const pipeline = await PipelineModel.findById(pipelineId).lean();
  return (pipeline?.history ?? []).map((item) => item.status ?? 'missing');
};

test('the migration gives entries without a status the running status', { skip }, async (t) => {
  await useDatabase(t);
  const createdAt = new Date();
  const affected = await insertPipeline([
    { createdAt, message: 'Перехід у чергу', status: PipelineStatus.queued },
    { createdAt, message: 'Початок обчислення', status: PipelineStatus.running },
    { createdAt, message: 'Зчитування файлу ЕЕГ' },
    { createdAt, message: 'Файл ЕЕГ зчитано', status: null },
    { createdAt, message: 'Обчислення завершено', status: PipelineStatus.completed },
  ]);
  const untouched = await insertPipeline([
    { createdAt, message: 'Перехід у чергу', status: PipelineStatus.queued },
  ]);
  const empty = await insertPipeline([]);

  assert.equal(await pipelineHistoryMissingStatusMigration.run(), 1);

  assert.deepEqual(await statusesOf(affected), [
    PipelineStatus.queued,
    PipelineStatus.running,
    PipelineStatus.running,
    PipelineStatus.running,
    PipelineStatus.completed,
  ]);
  assert.deepEqual(await statusesOf(untouched), [PipelineStatus.queued]);
  assert.deepEqual(await statusesOf(empty), []);

  // It runs on every start, so a second run must change nothing.
  assert.equal(await pipelineHistoryMissingStatusMigration.run(), 0);
});

test('worker progress lines keep the pipeline history readable', { skip }, async (t) => {
  await useDatabase(t);
  const original = config.backend.serviceToken;
  t.after(() => {
    config.backend.serviceToken = original;
  });
  config.backend.serviceToken = 'svc-token';

  const pipelineId = await insertPipeline([]);
  const experimentId = (await PipelineModel.findById(pipelineId).lean())!.experimentId;
  await WorkflowModel.create({
    type: WorkflowType.PIPELINE,
    instanceId: pipelineId,
    status: PipelineStatus.running,
  });

  const schema = buildGraphqlSchema([PipelineResolver]);
  const context = createGraphqlContext({
    req: { headers: { authorization: 'Bearer svc-token' } } as any,
  });

  // Exactly what aws-jobs sends: a message and progress, no status.
  const update = await executeGraphql(
    schema,
    `mutation($input: UpdatePipelineProgressInput!) { updatePipelineProgress(input: $input) { _id } }`,
    {
      context,
      variables: {
        input: {
          pipelineId: String(pipelineId),
          executionId: '1',
          progress: 3,
          message: 'Зчитування файлу ЕЕГ',
        },
      },
    }
  );
  assert.equal(update.errors, undefined);

  const read = await executeGraphql(
    schema,
    `query($id: ID!) { pipelines(experimentId: $id) { history { message status } } }`,
    { context, variables: { id: String(experimentId) } }
  );

  assert.equal(read.errors, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(read.data)), {
    pipelines: [{ history: [{ message: 'Зчитування файлу ЕЕГ', status: PipelineStatus.running }] }],
  });
});
