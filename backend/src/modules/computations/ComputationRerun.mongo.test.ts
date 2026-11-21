import assert from 'node:assert/strict';
import { test } from 'node:test';
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

test('simultaneous first re-runs of one path create a single run', { skip }, async (t) => {
  await mongoose.connect(uri!, { dbName: `rerun-test-${process.pid}-${Date.now()}` });
  await PipelineModel.createIndexes();
  t.after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

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

  const manager = new ComputationManager() as any;
  const ids = await Promise.all(
    Array.from({ length: 5 }, () => manager.prepareRerun(source.toObject()))
  );

  assert.equal(new Set(ids.map(String)).size, 1);
  assert.notEqual(String(ids[0]), String(source._id));
  assert.equal(await PipelineModel.countDocuments({ experimentId }), 2);
});
