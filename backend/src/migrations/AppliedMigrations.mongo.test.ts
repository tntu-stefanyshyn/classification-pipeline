import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import mongoose from 'mongoose';

import { PipelineStatus } from '../core/pipeline/enums';
import { PipelineModel } from '../core/pipeline/models/PipelineModel';
import { createWorkflowReadIndexes, WorkflowModel } from '../core/workflow/model/WorkflowModel';
import { ExperimentModel } from '../modules/experiments/models/ExperimentModel';
import { UploadedFileModel } from '../modules/files/models/UploadedFileModel';
import { AppliedMigrationModel } from './AppliedMigration';
import { runMigrations } from './index';

// The registry and the index definitions only prove themselves against a real MongoDB.
const uri = process.env.MONGODB_TEST_URI;
const skip = uri ? false : 'MONGODB_TEST_URI is not set';

const useDatabase = async (t: TestContext) => {
  await mongoose.connect(uri!, { dbName: `migrations-test-${process.pid}-${Date.now()}` });
  // Mongoose builds indexes once per process; every test database needs its own.
  await Promise.all(
    [AppliedMigrationModel, WorkflowModel, UploadedFileModel, ExperimentModel].map((model) =>
      model.createIndexes()
    )
  );
  t.after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
};

const counting = (name: string, fail = false) => {
  const migration = {
    name,
    calls: 0,
    run: async () => {
      migration.calls += 1;
      if (fail) throw new Error('boom');
      return 1;
    },
  };
  return migration;
};

test('each migration runs once and is recorded with its date', { skip }, async (t) => {
  await useDatabase(t);
  const first = counting('first');
  const second = counting('second');

  assert.equal(await runMigrations([first, second]), 2);
  assert.equal(await runMigrations([first, second]), 0);
  // A migration added later runs; the earlier ones do not.
  const third = counting('third');
  assert.equal(await runMigrations([first, second, third]), 1);

  assert.deepEqual([first.calls, second.calls, third.calls], [1, 1, 1]);
  const records = await AppliedMigrationModel.find().sort({ name: 1 }).lean();
  assert.deepEqual(
    records.map(({ name }) => name),
    ['first', 'second', 'third']
  );
  assert.ok(records.every(({ appliedAt }) => appliedAt instanceof Date));
});

test('a failed migration is not recorded and runs again on the next start', { skip }, async (t) => {
  await useDatabase(t);
  const broken = counting('broken', true);

  await assert.rejects(() => runMigrations([broken]), /boom/);
  await assert.rejects(() => runMigrations([broken]), /boom/);

  assert.equal(broken.calls, 2);
  assert.equal(await AppliedMigrationModel.countDocuments(), 0);
});

test('the real migrations run once on a database where they already ran', { skip }, async (t) => {
  await useDatabase(t);
  // Already migrated data and no registry: what every existing database looks like on upgrade.
  await PipelineModel.collection.insertOne({
    history: [{ message: 'done', status: PipelineStatus.idle }],
  });

  assert.equal(await runMigrations(), 0);

  const names = (await AppliedMigrationModel.find().lean()).map(({ name }) => name).sort();
  assert.deepEqual(names, [
    'pipeline-history-missing-status-to-running',
    'pipeline-legacy-statuses-to-idle',
  ]);
});

test(
  'backends starting together on an empty registry run each migration once',
  { skip },
  async (t) => {
    await useDatabase(t);
    // Mongoose builds the registry index once per process, in the background: settle it, then start
    // from a registry without the index, as on the first start after an upgrade.
    await AppliedMigrationModel.init();
    await AppliedMigrationModel.createCollection();
    await AppliedMigrationModel.collection.dropIndexes();
    const shared = counting('shared');

    await Promise.all(Array.from({ length: 8 }, () => runMigrations([shared])));

    // Taking turns: the later backends find the migration recorded and never call run().
    assert.equal(shared.calls, 1);
    assert.equal(await AppliedMigrationModel.countDocuments({ name: 'shared' }), 1);
    const indexes = await AppliedMigrationModel.listIndexes();
    assert.ok(indexes.some(({ key, unique }) => JSON.stringify(key) === '{"name":1}' && unique));
  }
);

test('the lock is released after a success and after a failure', { skip }, async (t) => {
  await useDatabase(t);
  const locks = mongoose.connection.collection('migration_lock');

  await runMigrations([counting('fine')]);
  assert.equal(await locks.countDocuments(), 0);

  await assert.rejects(() => runMigrations([counting('broken', true)]), /boom/);
  assert.equal(await locks.countDocuments(), 0);
});

test(
  'a lock left by a dead backend stops blocking once its lease has expired',
  { skip },
  async (t) => {
    await useDatabase(t);
    const locks = mongoose.connection.collection<{ _id: string; expiresAt: Date }>(
      'migration_lock'
    );
    await locks.insertOne({ _id: 'migrations', expiresAt: new Date(Date.now() - 1000) });
    const migration = counting('after-crash');

    assert.equal(await runMigrations([migration]), 1);

    assert.equal(migration.calls, 1);
    assert.equal(await locks.countDocuments(), 0);
  }
);

test(
  'the read indexes exist and are not built through Workflow, so startup does not wait',
  { skip },
  async (t) => {
    await useDatabase(t);
    await Promise.all([
      createWorkflowReadIndexes(),
      UploadedFileModel.createIndexes(),
      ExperimentModel.createIndexes(),
    ]);
    const keysOf = async (model: { listIndexes: () => Promise<{ key: object }[]> }) =>
      (await model.listIndexes()).map(({ key }) => JSON.stringify(key));

    const workflows = await keysOf(WorkflowModel);
    assert.ok(workflows.includes('{"instanceId":1,"type":1}'));
    assert.ok(workflows.includes('{"type":1,"status":1}'));
    assert.ok((await keysOf(UploadedFileModel)).includes('{"uploadedById":1,"uploadedAt":-1}'));
    assert.ok((await keysOf(ExperimentModel)).includes('{"fileId":1}'));
    // WorkflowModel.init() waits for every index declared on the class: only the unique one may be.
    assert.deepEqual(
      WorkflowModel.schema.indexes().map(([fields]) => Object.keys(fields)),
      [['machineHostname']]
    );
  }
);
