import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import mongoose, { Types } from 'mongoose';

import { PipelineStatus } from '../../core/pipeline/enums';
import { PipelineModel } from '../../core/pipeline/models/PipelineModel';
import { WorkflowType } from '../../core/workflow/enums';
import { WorkflowModel } from '../../core/workflow/model/WorkflowModel';
import { ExperimentStatus } from '../experiments/classes/ExperimentStatus';
import { ComputationQueue } from './classes/ComputationQueue';
import { ComputationManager } from './services/ComputationManager';

// The unique index is what settles two simultaneous first re-runs, so it needs a real MongoDB.
// CI provides the database (see Dockerfile.ci).
const uri = process.env.MONGODB_TEST_URI;
const skip = uri ? false : 'MONGODB_TEST_URI is not set';

// The backend awaits Model.init() at startup, so the index exists before the first request.
const useDatabase = async (t: TestContext) => {
  await mongoose.connect(uri!, { dbName: `rerun-test-${process.pid}-${Date.now()}` });
  await PipelineModel.init();
  t.after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
};

const seedCompletedRun = async () => {
  const experimentId = new Types.ObjectId();
  const source = await PipelineModel.create({
    experimentId,
    graphStructureId: new Types.ObjectId(),
    queue: ComputationQueue.local,
    pathNodeIds: [new Types.ObjectId()],
  });
  await WorkflowModel.create([
    { type: WorkflowType.EXPERIMENT, instanceId: experimentId, status: ExperimentStatus.computing },
    { type: WorkflowType.PIPELINE, instanceId: source._id, status: PipelineStatus.completed },
  ]);
  return { experimentId, source: source.toObject({ getters: true }) };
};

test('the rerunOf unique index exists once the model is initialised', { skip }, async (t) => {
  await useDatabase(t);

  const indexes = await PipelineModel.collection.indexes();

  assert.ok(indexes.some((index) => index.key.rerunOf === 1 && index.unique === true));
});

test('simultaneous first re-runs of one path create a single run', { skip }, async (t) => {
  await useDatabase(t);
  const { experimentId, source } = await seedCompletedRun();

  const manager = new ComputationManager() as any;
  const ids = await Promise.all(Array.from({ length: 5 }, () => manager.prepareRerun(source)));

  assert.equal(new Set(ids.map(String)).size, 1);
  assert.notEqual(String(ids[0]), String(source._id));
  assert.equal(await PipelineModel.countDocuments({ experimentId }), 2);
  assert.equal(
    await WorkflowModel.countDocuments({ instanceId: ids[0], type: WorkflowType.PIPELINE }),
    1
  );
});

test(
  'a re-run whose request died before creating the workflow is recovered',
  { skip },
  async (t) => {
    await useDatabase(t);
    const { experimentId, source } = await seedCompletedRun();
    // The earlier request created the run and died before its workflow.
    const orphan = await PipelineModel.create({
      experimentId,
      graphStructureId: source.graphStructureId,
      queue: source.queue,
      pathNodeIds: source.pathNodeIds,
      rerunOf: source._id,
    });

    const manager = new ComputationManager() as any;
    manager.orphanPollMs = 1;
    const id = await manager.prepareRerun(source);

    assert.equal(String(id), String(orphan._id));
    const workflows = await WorkflowModel.find({ instanceId: orphan._id }).lean();
    assert.equal(workflows.length, 1);
    assert.equal(workflows[0].status, PipelineStatus.idle);
    assert.equal(await PipelineModel.countDocuments({ experimentId }), 2);
  }
);
