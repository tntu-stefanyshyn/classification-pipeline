import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Types } from 'mongoose';

import { ComputationQueue } from '../../computations/classes/ComputationQueue';
import { ComputationMode } from '../classes/ComputationMode';
import { ClassificationStage } from '../classes/ClassificationStage';
import { GraphStructureModel } from '../models/GraphStructureModel';
import { createExecResult, stub } from '../../../test/testUtils';
import { GraphManager } from './GraphManager';

test('GraphManager graph retrieval and creation helpers handle found and missing graphs', async (t) => {
  const manager = new GraphManager();
  const graphId = new Types.ObjectId();
  const experimentId = new Types.ObjectId();
  const createCalls: any[] = [];

  stub(
    t,
    GraphStructureModel as unknown as Record<string, unknown>,
    'findOne',
    async (query: any) => {
      if (String(query._id ?? '') === graphId.toHexString()) {
        return { _id: graphId };
      }
      if (String(query.experimentId ?? '') === experimentId.toHexString()) {
        return { experimentId };
      }
      return null;
    }
  );
  stub(
    t,
    GraphStructureModel as unknown as Record<string, unknown>,
    'create',
    async (...args: any[]) => {
      createCalls.push(args);
      return {};
    }
  );

  assert.deepEqual(await manager.getById(graphId), { _id: graphId });
  assert.deepEqual(await manager.getByExperimentId(experimentId), { experimentId });
  await assert.rejects(() => manager.getById(new Types.ObjectId()), /Граф не знайдено/);
  await assert.rejects(() => manager.getByExperimentId(new Types.ObjectId()), /Граф не знайдено/);

  await manager.createDefaultGraph(experimentId);
  assert.deepEqual(createCalls, [[{ experimentId }]]);
});

test('GraphManager update helpers persist graph nodes, computation mode and normalized settings', async (t) => {
  const manager = new GraphManager();
  const experimentId = new Types.ObjectId().toHexString();
  const expectedGraph = { _id: new Types.ObjectId() };
  const updateCalls: any[] = [];

  stub(
    t,
    GraphStructureModel as unknown as Record<string, unknown>,
    'updateOne',
    (...args: any[]) => {
      updateCalls.push(args);
      return createExecResult();
    }
  );
  stub(
    t,
    manager as unknown as Record<string, unknown>,
    'getByExperimentId',
    async () => expectedGraph
  );

  const updateGraphResult = await manager.updateGraph(experimentId, [
    {
      _id: 'node-1',
      stage: ClassificationStage.PREPROCESSING,
      label: 'Normalize',
      technology: 'Normalize',
      type: 'technology',
    },
  ] as any);
  const updateModeResult = await manager.updateComputationMode(experimentId, ComputationMode.cloud);
  const updateSettingsResult = await manager.updateGraphSettings(experimentId, {
    metrics: {
      accuracy: 0.25,
      f1: 0.25,
      rocAuc: 0.25,
      ntps: 0.25,
    },
    queues: [ComputationQueue.local],
    folds: Number.NaN,
    hyperOptimizationMinutesPerPipeline: Number.NaN,
    predictDataPercent: Number.NaN,
  } as any);

  assert.equal(updateGraphResult, expectedGraph);
  assert.equal(updateModeResult, expectedGraph);
  assert.equal(updateSettingsResult, expectedGraph);
  assert.deepEqual(updateCalls[0], [
    { experimentId },
    {
      $set: {
        nodes: [
          {
            _id: 'node-1',
            stage: ClassificationStage.PREPROCESSING,
            label: 'Normalize',
            technology: 'Normalize',
            type: 'technology',
          },
        ],
      },
    },
  ]);
  assert.deepEqual(updateCalls[1], [
    { experimentId },
    { $set: { computationMode: ComputationMode.cloud } },
    { upsert: true },
  ]);
  assert.deepEqual(updateCalls[2], [
    { experimentId },
    {
      $set: {
        settings: {
          metrics: {
            accuracy: 0.25,
            f1: 0.25,
            rocAuc: 0.25,
            ntps: 0.25,
          },
          queues: [ComputationQueue.local],
          folds: 5,
          hyperOptimizationMinutesPerPipeline: 30,
          predictDataPercent: 20,
        },
      },
    },
  ]);
});

test('GraphManager.updateGraph rejects invalid stage order', async () => {
  const manager = new GraphManager();

  await assert.rejects(
    () =>
      manager.updateGraph('experiment-id', [
        {
          _id: 'classification',
          stage: ClassificationStage.CLASSIFICATION,
          label: 'Classifier',
          technology: 'Classifier',
          type: 'technology',
        },
        {
          _id: 'preprocessing',
          stage: ClassificationStage.PREPROCESSING,
          label: 'Normalize',
          technology: 'Normalize',
          type: 'technology',
          parentId: 'classification',
        },
      ] as any),
    /Наступний етап має йти після поточного/
  );
});

test('GraphManager.updateGraphSettings normalizes metrics, queues and numeric limits', async (t) => {
  const manager = new GraphManager();
  const experimentId = new Types.ObjectId().toHexString();
  const expectedGraph = { _id: new Types.ObjectId() };
  const updateCalls: any[] = [];

  stub(
    t,
    GraphStructureModel as unknown as Record<string, unknown>,
    'updateOne',
    (...args: any[]) => {
      updateCalls.push(args);
      return createExecResult();
    }
  );
  stub(
    t,
    manager as unknown as Record<string, unknown>,
    'getByExperimentId',
    async () => expectedGraph
  );

  const result = await manager.updateGraphSettings(experimentId, {
    metrics: {
      accuracy: '0.4',
      f1: '0.3',
      rocAuc: 0.2,
      ntps: '0.1',
    },
    queues: [ComputationQueue.local, ComputationQueue.cloud, ComputationQueue.local],
    folds: '5',
    hyperOptimizationMinutesPerPipeline: '45',
    predictDataPercent: '33',
  } as any);

  assert.equal(result, expectedGraph);
  assert.equal(updateCalls.length, 1);
  assert.deepEqual(updateCalls[0][0], { experimentId });
  assert.deepEqual(updateCalls[0][1], {
    $set: {
      settings: {
        metrics: {
          accuracy: 0.4,
          f1: 0.3,
          rocAuc: 0.2,
          ntps: 0.1,
        },
        queues: [ComputationQueue.local, ComputationQueue.cloud],
        folds: 5,
        hyperOptimizationMinutesPerPipeline: 45,
        predictDataPercent: 33,
      },
    },
  });
});

test('GraphManager.updateGraphSettings rejects invalid metric totals', async () => {
  const manager = new GraphManager();

  await assert.rejects(
    () =>
      manager.updateGraphSettings(new Types.ObjectId(), {
        metrics: {
          accuracy: 0.5,
          f1: 0.3,
          rocAuc: 0.3,
          ntps: 0.1,
        },
        queues: [ComputationQueue.local],
        folds: 5,
      } as any),
    /Сума ваг метрик має дорівнювати 1/
  );
});

test('GraphManager.updateGraphSettings validates metrics, queues and limits', async () => {
  const manager = new GraphManager();
  const normalize = (settings: any) => (manager as any).normalizeGraphSettings(settings);

  assert.throws(() => normalize(undefined), /Graph settings are required/);
  assert.throws(() => normalize({}), /Graph metrics are required/);
  assert.throws(
    () =>
      normalize({
        metrics: { accuracy: 'nope', f1: 0.25, rocAuc: 0.25, ntps: 0.5 },
        queues: [ComputationQueue.local],
      }),
    /Metric weight "accuracy" must be a number/
  );
  assert.throws(
    () =>
      normalize({
        metrics: { accuracy: 1.1, f1: 0, rocAuc: 0, ntps: -0.1 },
        queues: [ComputationQueue.local],
      }),
    /Metric weight "accuracy" must be between 0 and 1/
  );
  assert.throws(
    () =>
      normalize({
        metrics: { accuracy: 0.25, f1: 0.25, rocAuc: 0.25, ntps: 0.25 },
        queues: 'local',
      }),
    /Computation queues must be an array/
  );
  assert.throws(
    () =>
      normalize({
        metrics: { accuracy: 0.25, f1: 0.25, rocAuc: 0.25, ntps: 0.25 },
        queues: ['bad-queue'],
      }),
    /Unsupported computation queue value/
  );
  assert.throws(
    () =>
      normalize({
        metrics: { accuracy: 0.25, f1: 0.25, rocAuc: 0.25, ntps: 0.25 },
        queues: [],
      }),
    /Потрібно обрати хоча б один тип обчислень/
  );
  assert.throws(
    () =>
      normalize({
        metrics: { accuracy: 0.25, f1: 0.25, rocAuc: 0.25, ntps: 0.25 },
        queues: [ComputationQueue.local],
        folds: 0,
      }),
    /перехресної валідації має бути більшою за 0/
  );
  assert.throws(
    () =>
      normalize({
        metrics: { accuracy: 0.25, f1: 0.25, rocAuc: 0.25, ntps: 0.25 },
        queues: [ComputationQueue.local],
        folds: 21,
      }),
    /не більшою за 20/
  );
  assert.throws(
    () =>
      normalize({
        metrics: { accuracy: 0.25, f1: 0.25, rocAuc: 0.25, ntps: 0.25 },
        queues: [ComputationQueue.local],
        hyperOptimizationMinutesPerPipeline: 0,
      }),
    /гіпероптимізації для одного конвеєра має бути більшим за 0/
  );
  assert.throws(
    () =>
      normalize({
        metrics: { accuracy: 0.25, f1: 0.25, rocAuc: 0.25, ntps: 0.25 },
        queues: [ComputationQueue.local],
        predictDataPercent: 100,
      }),
    /Відсоток даних для предікту має бути цілим числом від 1 до 99/
  );
});

test('GraphManager.generateGraphFromSelections builds the selected graph structure', async (t) => {
  const manager = new GraphManager();
  const experimentId = new Types.ObjectId().toHexString();
  const preprocessingId = new Types.ObjectId().toHexString();
  const svmId = new Types.ObjectId().toHexString();
  const forestId = new Types.ObjectId().toHexString();
  let capturedNodes: any[] = [];

  stub(t, manager as unknown as Record<string, unknown>, 'technologyManager', {
    list: async () => [
      {
        _id: new Types.ObjectId(preprocessingId),
        name: 'Normalize',
        stage: ClassificationStage.PREPROCESSING,
        settings: [],
      },
      {
        _id: new Types.ObjectId(svmId),
        name: 'SVM',
        stage: ClassificationStage.CLASSIFICATION,
        settings: [],
      },
      {
        _id: new Types.ObjectId(forestId),
        name: 'Random Forest',
        stage: ClassificationStage.CLASSIFICATION,
        settings: [],
      },
    ],
  } as any);
  stub(
    t,
    manager as unknown as Record<string, unknown>,
    'updateGraph',
    async (_nextExperimentId: string, nodes: any[]) => {
      capturedNodes = nodes;
      return { _id: new Types.ObjectId(), nodes } as any;
    }
  );

  const result = await manager.generateGraphFromSelections(experimentId, [
    {
      stage: ClassificationStage.PREPROCESSING,
      technologyIds: [preprocessingId],
    },
    {
      stage: ClassificationStage.CLASSIFICATION,
      technologyIds: [svmId, forestId],
    },
  ] as any);

  assert.equal(result.nodes.length, 5);
  const root = capturedNodes.find((node) => node.stage === ClassificationStage.PREPROCESSING);
  const classifiers = capturedNodes.filter(
    (node) => node.stage === ClassificationStage.CLASSIFICATION
  );

  assert.ok(root);
  assert.equal(root.label, 'Normalize');
  assert.equal(classifiers.length, 4);
  assert.deepEqual(classifiers.map((node) => node.label).sort(), [
    'Random Forest',
    'Random Forest',
    'SVM',
    'SVM',
  ]);
  assert.equal(classifiers.filter((node) => node.parentId === root._id).length, 2);
  assert.equal(classifiers.filter((node) => node.parentId === undefined).length, 2);
});

test('GraphManager.generateGraphFromSelections requires a classification stage', async () => {
  const manager = new GraphManager();

  await assert.rejects(
    () =>
      manager.generateGraphFromSelections(new Types.ObjectId(), [
        {
          stage: ClassificationStage.PREPROCESSING,
          technologyIds: [new Types.ObjectId().toHexString()],
        },
      ] as any),
    /Фінальний етап має містити щонайменше одну технологію класифікації/
  );
});

test('GraphManager.generateGraphFromSelections validates selected technologies', async (t) => {
  const manager = new GraphManager();
  const validPreprocessingId = new Types.ObjectId().toHexString();

  stub(t, manager as unknown as Record<string, unknown>, 'technologyManager', {
    list: async () => [
      {
        _id: new Types.ObjectId(validPreprocessingId),
        name: 'Normalize',
        stage: ClassificationStage.PREPROCESSING,
        settings: [],
      },
    ],
  } as any);

  await assert.rejects(
    () =>
      manager.generateGraphFromSelections(new Types.ObjectId(), [
        {
          stage: ClassificationStage.CLASSIFICATION,
          technologyIds: ['bad-id'],
        },
      ] as any),
    /Некоректний ідентифікатор технології/
  );

  await assert.rejects(
    () =>
      manager.generateGraphFromSelections(new Types.ObjectId(), [
        {
          stage: ClassificationStage.CLASSIFICATION,
          technologyIds: [new Types.ObjectId().toHexString()],
        },
      ] as any),
    /Технологію не знайдено/
  );

  await assert.rejects(
    () =>
      manager.generateGraphFromSelections(new Types.ObjectId(), [
        {
          stage: ClassificationStage.CLASSIFICATION,
          technologyIds: [validPreprocessingId],
        },
      ] as any),
    /не відповідає етапу/
  );
});

test('GraphManager.normalizeGraphNodes infers stages, remaps ids and validates node integrity', async (t) => {
  const manager = new GraphManager();
  const childId = new Types.ObjectId();

  stub(t, manager as unknown as Record<string, unknown>, 'technologyManager', {
    list: async () => [
      {
        _id: new Types.ObjectId(),
        name: 'Normalize',
        stage: ClassificationStage.PREPROCESSING,
        settings: [{ key: 'method' }],
      },
      {
        _id: new Types.ObjectId(),
        name: 'SVM',
        stage: ClassificationStage.CLASSIFICATION,
        settings: [{ key: 'kernel' }, { key: 'gamma' }],
      },
    ],
  } as any);

  const normalized = await (manager as any).normalizeGraphNodes([
    {
      _id: 'legacy-root',
      label: ' Normalize ',
      type: ' ',
      settings: [
        { key: 'method', value: ' zscore ' },
        { key: 'ignored', value: '1' },
      ],
    },
    {
      _id: childId.toHexString(),
      label: 'SVM label',
      stage: ClassificationStage.CLASSIFICATION,
      technology: ' SVM ',
      parentId: 'legacy-root',
      type: ' custom ',
      settings: [
        { key: 'kernel', value: ' rbf ' },
        { key: 'gamma', value: ' ' },
      ],
    },
  ]);

  assert.equal(normalized.length, 2);
  assert.equal(normalized[0]._id instanceof Types.ObjectId, true);
  assert.notEqual(normalized[0]._id.toHexString(), 'legacy-root');
  assert.equal(normalized[0].stage, ClassificationStage.PREPROCESSING);
  assert.equal(normalized[0].technology, 'Normalize');
  assert.equal(normalized[0].type, 'technology');
  assert.deepEqual(normalized[0].settings, [{ key: 'method', value: 'zscore' }]);
  assert.equal(normalized[1]._id.toHexString(), childId.toHexString());
  assert.equal(normalized[1].parentId?.toHexString(), normalized[0]._id.toHexString());
  assert.equal(normalized[1].type, 'custom');
  assert.deepEqual(normalized[1].settings, [{ key: 'kernel', value: 'rbf' }]);

  await assert.rejects(
    () => (manager as any).normalizeGraphNodes([{ _id: ' ', label: 'A' }]),
    /Graph node _id is required/
  );
  await assert.rejects(
    () => (manager as any).normalizeGraphNodes([{ _id: 'dup' }, { _id: 'dup' }]),
    /Graph node _id must be unique: dup/
  );
  await assert.rejects(
    () => (manager as any).normalizeGraphNodes([{ _id: 'node-1', label: ' ' }]),
    /Graph node technology is required/
  );
  await assert.rejects(
    () =>
      (manager as any).normalizeGraphNodes([
        { _id: 'node-1', stage: 'WRONG_STAGE', technology: 'SVM' },
      ]),
    /Unsupported classification stage/
  );
  await assert.rejects(
    () => (manager as any).normalizeGraphNodes([{ _id: 'node-1', technology: 'Unknown' }]),
    /Graph node stage is required/
  );
  await assert.rejects(
    () =>
      (manager as any).normalizeGraphNodes([
        { _id: 'node-1', stage: ClassificationStage.CLASSIFICATION, technology: 'Normalize' },
      ]),
    /Unsupported technology for stage CLASSIFICATION/
  );
  await assert.rejects(
    () =>
      (manager as any).normalizeGraphNodes([
        {
          _id: 'node-1',
          stage: ClassificationStage.CLASSIFICATION,
          technology: 'SVM',
          parentId: 'missing-parent',
        },
      ]),
    /Parent node not found/
  );
  await assert.rejects(
    () =>
      (manager as any).normalizeGraphNodes([
        {
          _id: childId.toHexString(),
          stage: ClassificationStage.CLASSIFICATION,
          technology: 'SVM',
          parentId: childId.toHexString(),
        },
      ]),
    /Graph node cannot reference itself/
  );
});

test('GraphManager.validateStageOrder checks ids, stages and parent ordering', () => {
  const manager = new GraphManager();
  const validate = (nodes: any[]) => (manager as any).validateStageOrder(nodes);

  assert.doesNotThrow(() => validate([]));
  assert.doesNotThrow(() =>
    validate([
      {
        _id: 'preprocessing',
        stage: ClassificationStage.PREPROCESSING,
      },
      {
        _id: 'classification',
        stage: ClassificationStage.CLASSIFICATION,
        parentId: 'preprocessing',
      },
    ])
  );
  assert.throws(
    () => validate([{ _id: ' ', stage: ClassificationStage.PREPROCESSING }]),
    /Graph node _id is required/
  );
  assert.throws(
    () => validate([{ _id: 'node-1', stage: 'WRONG_STAGE' }]),
    /Unsupported classification stage for node node-1/
  );
  assert.throws(
    () =>
      validate([{ _id: 'node-1', stage: ClassificationStage.CLASSIFICATION, parentId: 'missing' }]),
    /Parent node not found for node-1/
  );
  assert.throws(
    () =>
      validate([
        {
          _id: 'child',
          stage: ClassificationStage.CLASSIFICATION,
          parentId: 'parent',
        },
        {
          _id: 'parent',
          stage: 'WRONG_STAGE',
        },
      ]),
    /Unsupported parent stage for node child/
  );
});

test('GraphManager.ensureGraphNodeIntegrity preserves valid graphs and normalizes legacy nodes', async (t) => {
  const manager = new GraphManager();
  const updateCalls: any[] = [];
  const experimentId = new Types.ObjectId();
  const validGraph = {
    experimentId,
    nodes: [
      {
        _id: new Types.ObjectId(),
        stage: ClassificationStage.PREPROCESSING,
        technology: 'Normalize',
        type: 'technology',
      },
    ],
  };

  stub(t, manager as unknown as Record<string, unknown>, 'technologyManager', {
    list: async () => [
      {
        _id: new Types.ObjectId(),
        name: 'Normalize',
        stage: ClassificationStage.PREPROCESSING,
        settings: [{ key: 'method' }],
      },
    ],
  } as any);
  stub(
    t,
    GraphStructureModel as unknown as Record<string, unknown>,
    'updateOne',
    async (...args: any[]) => {
      updateCalls.push(args);
      return {};
    }
  );

  const emptyGraph = { nodes: [] };
  assert.equal(await (manager as any).ensureGraphNodeIntegrity(emptyGraph), emptyGraph);
  assert.equal(await (manager as any).ensureGraphNodeIntegrity(validGraph), validGraph);

  const legacyGraph = {
    experimentId: experimentId.toHexString(),
    nodes: [
      {
        _id: 'legacy-node',
        label: 'Normalize',
        settings: [{ key: 'method', value: ' zscore ' }],
      },
    ],
  };
  const normalized = await (manager as any).ensureGraphNodeIntegrity(legacyGraph);

  assert.equal(normalized.experimentId instanceof Types.ObjectId, true);
  assert.equal(normalized.nodes[0]._id instanceof Types.ObjectId, true);
  assert.equal(normalized.nodes[0].stage, ClassificationStage.PREPROCESSING);
  assert.equal(normalized.nodes[0].technology, 'Normalize');
  assert.equal(normalized.nodes[0].type, 'technology');
  assert.deepEqual(normalized.nodes[0].settings, [{ key: 'method', value: 'zscore' }]);
  assert.equal(normalized.createdAt instanceof Date, true);
  assert.deepEqual(updateCalls[0][0], { experimentId });
  assert.equal(updateCalls[0][2].upsert, true);
});
