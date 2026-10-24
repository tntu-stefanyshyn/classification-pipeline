import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { Types } from 'mongoose';

import { WorkflowModel } from '../../core/workflow/model/WorkflowModel';
import { stub } from '../../test/testUtils';
import { ExperimentStatus } from '../experiments/classes/ExperimentStatus';
import { ExperimentModel } from '../experiments/models/ExperimentModel';
import { ExperimentManager } from '../experiments/services/ExperimentManager';
import { UploadedFileModel } from './models/UploadedFileModel';
import { FileStore } from './services/FileStore';

type FakeFile = {
  _id: Types.ObjectId;
  storageKey: string;
  uploadedById: string;
  deletingAt?: Date;
};
type FakeExperiment = {
  _id: Types.ObjectId;
  name: string;
  createdById: string;
  fileId?: unknown;
  status: ExperimentStatus;
};

// Every model call yields to the event loop, so concurrent callers interleave.
const tick = () => new Promise((resolve) => setImmediate(resolve));
const same = (left: unknown, right: unknown) => String(left) === String(right);
const inList = (value: unknown, condition: any) =>
  condition?.$in
    ? condition.$in.some((item: unknown) => same(item, value))
    : same(condition, value);

// In-memory uploaded_files, experiments and their workflows; the real FileStore,
// ExperimentManager and WorkflowManager run on top of it.
const setup = (t: TestContext) => {
  const ownerId = new Types.ObjectId().toHexString();
  const file: FakeFile = {
    _id: new Types.ObjectId(),
    storageKey: 'uploads/dataset.csv',
    uploadedById: ownerId,
  };
  const state = {
    file: file as FakeFile | undefined,
    experiments: [] as FakeExperiment[],
    deletedKeys: [] as string[],
    generatedPipelinesFor: [] as string[],
    failStorage: 0,
    failDbDelete: 0,
    // Hooks for forcing a specific interleaving.
    onReferenceCheck: () => undefined as void,
    onStatusRead: () => undefined as void,
    beforeExperimentWrite: Promise.resolve(),
    beforeStatusWrite: Promise.resolve(),
  };
  const isFile = (id: unknown) => state.file && same(state.file._id, id);
  const experimentById = (id: unknown) => state.experiments.find((item) => same(item._id, id));

  // uploaded_files
  stub(t, UploadedFileModel as unknown as Record<string, unknown>, 'findOne', (query: any) => ({
    lean: async () => {
      await tick();
      return isFile(query._id) && same(state.file!.uploadedById, query.uploadedById)
        ? { ...state.file! }
        : null;
    },
  }));
  stub(t, UploadedFileModel as unknown as Record<string, unknown>, 'findById', (id: unknown) => ({
    lean: async () => {
      await tick();
      return isFile(id) ? { ...state.file! } : null;
    },
  }));
  stub(
    t,
    UploadedFileModel as unknown as Record<string, unknown>,
    'updateOne',
    async (filter: any, update: any) => {
      await tick();
      const current = state.file;
      if (!current || !isFile(filter._id)) return { matchedCount: 0 };
      if (filter.deletingAt && current.deletingAt?.getTime() !== filter.deletingAt.getTime()) {
        return { matchedCount: 0 };
      }
      if (update.$set?.deletingAt) current.deletingAt = update.$set.deletingAt;
      if (update.$unset && 'deletingAt' in update.$unset) delete current.deletingAt;
      return { matchedCount: 1 };
    }
  );
  stub(
    t,
    UploadedFileModel as unknown as Record<string, unknown>,
    'deleteOne',
    async (filter: any) => {
      await tick();
      if (state.failDbDelete > 0) {
        state.failDbDelete -= 1;
        throw new Error('db unavailable');
      }
      if (isFile(filter._id)) state.file = undefined;
      return {};
    }
  );
  stub(t, UploadedFileModel as unknown as Record<string, unknown>, 'exists', async (query: any) => {
    await tick();
    const usable =
      isFile(query._id) && !(query.deletingAt?.$exists === false && state.file!.deletingAt);
    return usable ? { _id: state.file!._id } : null;
  });

  // experiments
  stub(t, ExperimentModel as unknown as Record<string, unknown>, 'find', (query: any) => ({
    select: () => ({
      lean: async () => {
        await tick();
        const found = state.experiments
          .filter((item) => item.fileId !== undefined && same(item.fileId, query.fileId))
          .map(({ _id, name, createdById }) => ({ _id, name, createdById }));
        state.onReferenceCheck();
        return found;
      },
    }),
  }));
  stub(t, ExperimentModel as unknown as Record<string, unknown>, 'findOne', (query: any) => ({
    lean: async () => {
      await tick();
      const experiment = experimentById(query._id);
      return experiment ? { ...experiment } : null;
    },
  }));
  stub(
    t,
    ExperimentModel as unknown as Record<string, unknown>,
    'updateMany',
    async (filter: any, update: any) => {
      await tick();
      for (const experiment of state.experiments) {
        if (inList(experiment._id, filter._id) && same(experiment.fileId, filter.fileId)) {
          if (update.$unset?.fileId) delete experiment.fileId;
        }
      }
      return {};
    }
  );
  stub(t, ExperimentModel as unknown as Record<string, unknown>, 'create', async (payload: any) => {
    await state.beforeExperimentWrite;
    await tick();
    const experiment = {
      _id: new Types.ObjectId(),
      status: ExperimentStatus.creating,
      ...payload,
    };
    state.experiments.push(experiment);
    return { _id: experiment._id, toObject: () => ({ ...experiment }) };
  });
  stub(
    t,
    ExperimentModel as unknown as Record<string, unknown>,
    'deleteOne',
    async (filter: any) => {
      await tick();
      state.experiments = state.experiments.filter((item) => !same(item._id, filter._id));
      return {};
    }
  );
  stub(
    t,
    ExperimentModel as unknown as Record<string, unknown>,
    'findOneAndUpdate',
    (filter: any, ops: any) => ({
      lean: async () => {
        await tick();
        const experiment = experimentById(filter._id) as any;
        if (!experiment) return null;
        Object.assign(experiment, ops.$set ?? {});
        for (const key of Object.keys(ops.$unset ?? {})) delete experiment[key];
        return { ...experiment };
      },
    })
  );

  // workflows: experiment statuses live here
  stub(t, WorkflowModel as unknown as Record<string, unknown>, 'find', (query: any) => ({
    lean: async () => {
      await tick();
      state.onStatusRead();
      return state.experiments
        .filter((item) => inList(item._id, query.instanceId))
        .map((item) => ({ instanceId: item._id, status: item.status }));
    },
  }));
  stub(t, WorkflowModel as unknown as Record<string, unknown>, 'findOne', (query: any) => ({
    sort: () => ({
      lean: async () => {
        await tick();
        const experiment = experimentById(query.instanceId);
        return experiment ? { _id: experiment._id, status: experiment.status } : null;
      },
    }),
  }));
  stub(
    t,
    WorkflowModel as unknown as Record<string, unknown>,
    'updateOne',
    async (filter: any, update: any) => {
      await state.beforeStatusWrite;
      await tick();
      const experiment = experimentById(filter._id ?? filter.instanceId);
      if (!experiment || (filter.status !== undefined && experiment.status !== filter.status)) {
        return { matchedCount: 0, modifiedCount: 0 };
      }
      experiment.status = update.$set.status;
      return { matchedCount: 1, modifiedCount: 1 };
    }
  );

  const store = new FileStore();
  stub(t, store as unknown as Record<string, unknown>, 'getStorage', () => ({
    deleteObject: async (key: string) => {
      await tick();
      if (state.failStorage > 0) {
        state.failStorage -= 1;
        throw new Error('S3 unavailable');
      }
      state.deletedKeys.push(key);
    },
  }));

  const experiments = new ExperimentManager();
  stub(t, experiments as unknown as Record<string, unknown>, 'pipelineManager', {
    generatePipelinesFromGraphStructure: async (id: unknown) => {
      state.generatedPipelinesFor.push(String(id));
      return [];
    },
  } as any);
  // Experiment creation only needs the initial workflow record.
  const creator = new ExperimentManager();
  stub(t, creator as unknown as Record<string, unknown>, 'graphManager', {
    createDefaultGraph: async () => undefined,
  } as any);
  stub(t, creator as unknown as Record<string, unknown>, 'workflowManager', {
    create: async () => true,
  } as any);

  const fileId = file._id.toHexString();
  const addExperiment = (overrides: Partial<FakeExperiment> = {}) => {
    const experiment: FakeExperiment = {
      _id: new Types.ObjectId(),
      name: 'Iris baseline',
      createdById: ownerId,
      fileId,
      status: ExperimentStatus.configuring,
      ...overrides,
    };
    state.experiments.push(experiment);
    return experiment;
  };
  const remove = (detach: FakeExperiment[] = [], userId = ownerId) =>
    store.remove(
      fileId,
      userId,
      detach.map((item) => item._id.toHexString())
    );
  const attach = () => creator.create({ name: 'New experiment', fileId } as any, ownerId);
  const startComputing = (experiment: FakeExperiment) =>
    experiments.changeStatus({
      experimentId: experiment._id.toHexString(),
      status: ExperimentStatus.computing,
    });
  // Like the experiment edit form, which always resends the current fileId.
  const edit = (experiment: FakeExperiment, input: { name?: string; fileId?: string }) =>
    experiments.update({ _id: experiment._id.toHexString(), ...input } as any, ownerId);

  return { state, ownerId, fileId, store, addExperiment, remove, attach, startComputing, edit };
};

test('an unreferenced file is deleted from storage and the database', async (t) => {
  const { state, remove } = setup(t);

  await remove();

  assert.equal(state.file, undefined);
  assert.deepEqual(state.deletedKeys, ['uploads/dataset.csv']);
});

test('file usage lists the owner experiments with statuses and only counts other users', async (t) => {
  const { ownerId, fileId, store, addExperiment } = setup(t);
  const idle = addExperiment({ name: 'Iris baseline' });
  const computing = addExperiment({ name: 'Wine', status: ExperimentStatus.computing });
  const optimizing = addExperiment({ name: 'Digits', status: ExperimentStatus.optimization });
  addExperiment({ name: 'Private', createdById: new Types.ObjectId().toHexString() });

  const usage = await store.getUsage(fileId, ownerId);

  assert.deepEqual(
    usage.experiments.map(({ _id, name, status, blocking }) => [
      String(_id),
      name,
      status,
      blocking,
    ]),
    [
      [String(idle._id), 'Iris baseline', ExperimentStatus.configuring, false],
      [String(computing._id), 'Wine', ExperimentStatus.computing, true],
      [String(optimizing._id), 'Digits', ExperimentStatus.optimization, true],
    ]
  );
  assert.equal(usage.otherExperimentsCount, 1);
  assert.equal(usage.blocked, true);
  assert.doesNotMatch(JSON.stringify(usage), /Private/);
  await assert.rejects(
    () => store.getUsage(fileId, new Types.ObjectId().toHexString()),
    /File not found/
  );
});

test('deleting a referenced file requires confirming the affected experiments', async (t) => {
  const { state, remove, addExperiment } = setup(t);
  const experiment = addExperiment();

  await assert.rejects(() => remove(), /"Iris baseline".*Підтвердіть відʼєднання/);

  assert.ok(state.file);
  assert.equal(state.file?.deletingAt, undefined);
  assert.ok(experiment.fileId);
  assert.deepEqual(state.deletedKeys, []);
});

test('a confirmed delete detaches the file from every experiment and deletes it', async (t) => {
  const { state, remove, addExperiment } = setup(t);
  const own = addExperiment({ status: ExperimentStatus.completed });
  const others = addExperiment({ createdById: new Types.ObjectId().toHexString() });

  await remove([own]);

  assert.equal(state.file, undefined);
  assert.deepEqual(state.deletedKeys, ['uploads/dataset.csv']);
  assert.equal(own.fileId, undefined);
  assert.equal(others.fileId, undefined);
});

for (const status of [ExperimentStatus.computing, ExperimentStatus.optimization]) {
  test(`deletion is blocked while an experiment is ${status}, even when confirmed`, async (t) => {
    const { state, remove, addExperiment } = setup(t);
    const experiment = addExperiment({ status });

    await assert.rejects(() => remove([experiment]), /Дочекайтеся завершення/);

    assert.ok(state.file);
    assert.equal(state.file?.deletingAt, undefined);
    assert.ok(experiment.fileId);
    assert.deepEqual(state.deletedKeys, []);
  });
}

test('a confirmation that misses a newly attached experiment is rejected', async (t) => {
  const { state, remove, addExperiment } = setup(t);
  const reviewed = addExperiment({ name: 'Reviewed' });
  const attachedLater = addExperiment({ name: 'Attached later' });

  await assert.rejects(() => remove([reviewed]), /"Attached later"/);

  assert.ok(state.file);
  assert.ok(reviewed.fileId);
  assert.ok(attachedLater.fileId);
});

for (const fileState of ['already deleted', 'marked for deletion'] as const) {
  test(`an experiment whose file is ${fileState} can still be renamed when the file is unchanged`, async (t) => {
    const { state, fileId, addExperiment, edit } = setup(t);
    const experiment = addExperiment({ name: 'Old name' });
    if (fileState === 'already deleted') state.file = undefined;
    else state.file!.deletingAt = new Date();

    await edit(experiment, { name: 'New name', fileId });

    assert.equal(experiment.name, 'New name');
    assert.equal(String(experiment.fileId), fileId);
  });
}

test('changing an experiment to another file still validates the new file', async (t) => {
  const { state, fileId, addExperiment, edit } = setup(t);
  const experiment = addExperiment({ fileId: new Types.ObjectId().toHexString() });
  const previousFileId = String(experiment.fileId);

  state.file!.deletingAt = new Date();
  await assert.rejects(() => edit(experiment, { fileId }), /видаляється/);
  assert.equal(String(experiment.fileId), previousFileId);

  await assert.rejects(
    () => edit(experiment, { fileId: new Types.ObjectId().toHexString() }),
    /Файл не знайдено/
  );
  assert.equal(String(experiment.fileId), previousFileId);

  delete state.file!.deletingAt;
  await edit(experiment, { fileId });
  assert.equal(String(experiment.fileId), fileId);
});

test('only the owner can delete a file', async (t) => {
  const { state, remove } = setup(t);

  await assert.rejects(() => remove([], new Types.ObjectId().toHexString()), /File not found/);

  assert.ok(state.file);
  assert.deepEqual(state.deletedKeys, []);
});

test('a storage failure keeps the confirmed detach and a retry deletes the file', async (t) => {
  const { state, remove, addExperiment } = setup(t);
  const experiment = addExperiment();
  state.failStorage = 1;

  await assert.rejects(() => remove([experiment]), /S3 unavailable/);
  assert.ok(state.file);
  assert.equal(state.file?.deletingAt, undefined);
  assert.equal(experiment.fileId, undefined);

  await remove();
  assert.equal(state.file, undefined);
  assert.deepEqual(state.deletedKeys, ['uploads/dataset.csv']);
});

test('a database failure after the storage delete keeps the file blocked until a retry', async (t) => {
  const { state, remove, attach } = setup(t);
  state.failDbDelete = 1;

  await assert.rejects(() => remove(), /db unavailable/);
  assert.ok(state.file?.deletingAt instanceof Date);
  await assert.rejects(() => attach(), /видаляється/);
  assert.deepEqual(state.experiments, []);

  await remove();
  assert.equal(state.file, undefined);
  assert.deepEqual(state.deletedKeys, ['uploads/dataset.csv', 'uploads/dataset.csv']);
});

for (const order of ['delete first', 'attach first'] as const) {
  test(`deleting a file while an experiment attaches it never leaves a dangling reference (${order})`, async (t) => {
    const { state, fileId, remove, attach } = setup(t);

    const results = await Promise.allSettled(
      order === 'delete first' ? [remove(), attach()] : [attach(), remove()]
    );

    const referencing = state.experiments.filter((item) => same(item.fileId, fileId));
    if (!state.file) assert.deepEqual(referencing, []);
    for (const result of results) {
      if (result.status === 'rejected') {
        assert.match(String(result.reason), /використовується|видаляється/);
      }
    }
  });
}

test('an experiment written after the deletion checked for references is rolled back', async (t) => {
  const { state, remove, attach } = setup(t);
  // Hold the experiment write until the deletion has looked for references and found none.
  let releaseWrite!: () => void;
  state.beforeExperimentWrite = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  state.onReferenceCheck = () => releaseWrite();

  const [removed, attached] = await Promise.allSettled([remove(), attach()]);

  assert.equal(removed.status, 'fulfilled');
  assert.equal(state.file, undefined);
  assert.equal(attached.status, 'rejected');
  assert.deepEqual(state.experiments, []);
});

for (const order of ['delete first', 'compute first'] as const) {
  test(`deleting a file while its experiment starts computing never computes without the file (${order})`, async (t) => {
    const { state, remove, addExperiment, startComputing } = setup(t);
    const experiment = addExperiment();

    await Promise.allSettled(
      order === 'delete first'
        ? [remove([experiment]), startComputing(experiment)]
        : [startComputing(experiment), remove([experiment])]
    );

    if (experiment.status === ExperimentStatus.computing) {
      assert.ok(state.file);
      assert.ok(experiment.fileId);
    } else {
      assert.equal(experiment.status, ExperimentStatus.configuring);
      assert.deepEqual(state.generatedPipelinesFor, []);
    }
  });
}

test('computing that starts after the deletion read statuses is reverted before any run', async (t) => {
  const { state, remove, addExperiment, startComputing } = setup(t);
  const experiment = addExperiment();
  // Hold the status write until the deletion has read experiment statuses (still configuring).
  let releaseStatusWrite!: () => void;
  state.beforeStatusWrite = new Promise<void>((resolve) => {
    releaseStatusWrite = resolve;
  });
  state.onStatusRead = () => releaseStatusWrite();

  const [removed, started] = await Promise.allSettled([
    remove([experiment]),
    startComputing(experiment),
  ]);

  assert.equal(removed.status, 'fulfilled');
  assert.equal(state.file, undefined);
  assert.equal(started.status, 'rejected');
  assert.equal(experiment.status, ExperimentStatus.configuring);
  assert.deepEqual(state.generatedPipelinesFor, []);
});
