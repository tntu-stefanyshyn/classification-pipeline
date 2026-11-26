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
import { PipelineManager } from '../../core/pipeline/services/PipelineManager';
import { ExperimentModel } from '../experiments/models/ExperimentModel';

// Re-run admissions are serialized by the experiment lock, and the unique indexes back it up, so
// they are tested against a real MongoDB. CI provides the database (see Dockerfile.ci).
const uri = process.env.MONGODB_TEST_URI;
const skip = uri ? false : 'MONGODB_TEST_URI is not set';

// The backend awaits Model.init() at startup, so the index exists before the first request.
const useDatabase = async (t: TestContext) => {
  await mongoose.connect(uri!, { dbName: `rerun-test-${process.pid}-${Date.now()}` });
  await PipelineModel.init();
  await WorkflowModel.init();
  t.after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
};

const seedCompletedRun = async () => {
  const { _id: experimentId } = await ExperimentModel.create({
    createdById: new Types.ObjectId(),
    name: 'experiment',
  });
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
  manager.lockPollMs = 10;
  await Promise.all(Array.from({ length: 5 }, () => manager.admitRerun(source)));

  const reruns = await PipelineModel.find({ experimentId, rerunOf: source._id }).lean();
  assert.equal(reruns.length, 1);
  const workflows = await WorkflowModel.find({ instanceId: reruns[0]._id }).lean();
  assert.equal(workflows.length, 1);
  assert.equal(workflows[0].status, PipelineStatus.queued);
  // The lock is let go once every admission is done.
  assert.equal((await ExperimentModel.findById(experimentId).lean())?.operationLock, undefined);
});

test(
  'a re-run whose admission died before creating the workflow is recovered',
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
    manager.lockPollMs = 10;
    // Several clicks find the same orphan; all of them settle on it and its one workflow.
    await Promise.all(Array.from({ length: 5 }, () => manager.admitRerun(source)));

    const workflows = await WorkflowModel.find({ instanceId: orphan._id }).lean();
    assert.equal(workflows.length, 1);
    assert.equal(workflows[0].status, PipelineStatus.queued);
    assert.equal(await PipelineModel.countDocuments({ experimentId }), 2);
  }
);

test(
  'the workflow of a re-run is unique, whatever number of creators race',
  { skip },
  async (t) => {
    await useDatabase(t);
    const runId = new Types.ObjectId();
    const manager = new PipelineManager();

    await Promise.all(Array.from({ length: 10 }, () => manager.ensureRerunWorkflow(runId)));

    const workflows = await WorkflowModel.find({ instanceId: runId }).lean();
    assert.equal(workflows.length, 1);
    assert.equal(workflows[0].status, PipelineStatus.idle);
    assert.equal(workflows[0].rerun, true);
  }
);

test('a slow creator does not hide a workflow that has moved on', { skip }, async (t) => {
  await useDatabase(t);
  const runId = new Types.ObjectId();
  const manager = new PipelineManager();
  await manager.ensureRerunWorkflow(runId);
  // A recovery created the workflow and a worker has queued the run since.
  await WorkflowModel.updateOne({ instanceId: runId }, { $set: { status: PipelineStatus.queued } });

  await manager.ensureRerunWorkflow(runId);

  const workflows = await WorkflowModel.find({ instanceId: runId }).lean();
  assert.equal(workflows.length, 1);
  assert.equal(workflows[0].status, PipelineStatus.queued);
});

test(
  'the rerun unique index on workflows exists once the model is initialised',
  { skip },
  async (t) => {
    await useDatabase(t);

    const indexes = await WorkflowModel.collection.indexes();

    assert.ok(
      indexes.some(
        (index) =>
          index.key.instanceId === 1 &&
          index.unique === true &&
          JSON.stringify(index.partialFilterExpression) === JSON.stringify({ rerun: true })
      )
    );
  }
);
