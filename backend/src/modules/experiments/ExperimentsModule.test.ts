import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Types } from 'mongoose';
import puppeteer from 'puppeteer';

import { WorkflowType } from '../../core/workflow/enums';
import { stub, createLeanResult } from '../../test/testUtils';
import { AuthFlow } from '../auth/services/AuthFlow';
import { ComputationMode } from './classes/ComputationMode';
import { ComputationQueue } from '../computations/classes/ComputationQueue';
import { ClassificationStage, CLASSIFICATION_STAGE_VALUES } from './classes/ClassificationStage';
import {
  CLASSIFICATION_TECHNOLOGIES,
  getDefaultTechnology,
  isTechnologyAllowed,
} from './classes/ClassificationTechnology';
import { ChangeExperimentStatusInput } from './classes/ChangeExperimentStatusInput';
import { CreateExperimentInput } from './classes/CreateExperimentInput';
import { Experiment } from './classes/Experiment';
import { ExperimentOptimization } from './classes/ExperimentOptimization';
import { ExperimentStatus, EXPERIMENT_STATUS_VALUES } from './classes/ExperimentStatus';
import { GenerateExperimentGraphInput } from './classes/GenerateExperimentGraphInput';
import { GraphEdge } from './classes/GraphEdge';
import { GraphMetricWeights } from './classes/GraphMetricWeights';
import { GraphNode } from './classes/GraphNode';
import { GraphNodeInput } from './classes/GraphNodeInput';
import { GraphNodeSetting } from './classes/GraphNodeSetting';
import { GraphStageSelectionInput } from './classes/GraphStageSelectionInput';
import { GraphStructure } from './classes/GraphStructure';
import { GraphStructureSettings } from './classes/GraphStructureSettings';
import { OptimizationHistoryItem } from './classes/OptimizationHistoryItem';
import { OptimizationStatus } from './classes/OptimizationStatus';
import { UpdateExperimentInput } from './classes/UpdateExperimentInput';
import { UpdateExperimentOptimizationResultInput } from './classes/UpdateExperimentOptimizationResultInput';
import { UpdateExperimentProgressInput } from './classes/UpdateExperimentProgressInput';
import { Experiments } from './graphql/Experiments';
import { UploadedFileModel } from '../files/models/UploadedFileModel';
import { ExperimentModel } from './models/ExperimentModel';
import { GraphStructureModel } from './models/GraphStructureModel';
import { ExperimentManager } from './services/ExperimentManager';
import { GraphManager } from './services/GraphManager';
import { buildGraphReportPdf } from './utils/buildGraphReportPdf';

test('experiment classes, helpers and model metadata are available', () => {
  const now = new Date();
  const experiment = new Experiment();
  const optimization = new ExperimentOptimization();
  const changeStatus = new ChangeExperimentStatusInput();
  const createInput = new CreateExperimentInput();
  const generateInput = new GenerateExperimentGraphInput();
  const edge = new GraphEdge();
  const metricWeights = new GraphMetricWeights();
  const node = new GraphNode();
  const nodeInput = new GraphNodeInput();
  const nodeSetting = new GraphNodeSetting();
  const stageSelection = new GraphStageSelectionInput();
  const structure = new GraphStructure();
  const structureSettings = new GraphStructureSettings();
  const historyItem = new OptimizationHistoryItem();
  const updateInput = new UpdateExperimentInput();
  const updateOptimizationInput = new UpdateExperimentOptimizationResultInput();
  const updateProgressInput = new UpdateExperimentProgressInput();

  nodeSetting.key = 'kernel';
  nodeSetting.value = 'rbf';
  node._id = new Types.ObjectId();
  node.label = 'SVM';
  node.stage = ClassificationStage.CLASSIFICATION;
  node.technology = 'SVM';
  node.settings = [nodeSetting];
  node.type = 'technology';
  node.parentId = new Types.ObjectId();

  nodeInput._id = 'node-1';
  nodeInput.label = 'SVM';
  nodeInput.stage = ClassificationStage.CLASSIFICATION;
  nodeInput.technology = 'SVM';
  nodeInput.settings = [nodeSetting];
  nodeInput.type = 'technology';
  nodeInput.parentId = 'node-0';

  metricWeights.accuracy = 0.25;
  metricWeights.f1 = 0.25;
  metricWeights.rocAuc = 0.25;
  metricWeights.ntps = 0.25;

  structureSettings.metrics = metricWeights;
  structureSettings.queues = [ComputationQueue.local];
  structureSettings.folds = 5;
  structureSettings.hyperOptimizationMinutesPerPipeline = 30;
  structureSettings.predictDataPercent = 20;

  structure._id = new Types.ObjectId();
  structure.experimentId = new Types.ObjectId();
  structure.nodes = [node];
  structure.settings = structureSettings;
  structure.computationMode = ComputationMode.both;
  structure.createdAt = now;

  optimization.progress = 90;
  optimization.history = [];
  optimization.status = OptimizationStatus.optimizing;
  optimization.bestPipelineId = new Types.ObjectId();
  optimization.bestScore = 0.42;

  experiment._id = new Types.ObjectId();
  experiment.createdById = new Types.ObjectId();
  experiment.name = 'Experiment';
  experiment.description = 'Description';
  experiment.fileId = new Types.ObjectId();
  experiment.computationHosts = [];
  experiment.optimization = optimization;
  experiment.createdAt = now;

  changeStatus.experimentId = experiment._id;
  changeStatus.status = ExperimentStatus.configuring;
  createInput.name = 'Experiment';
  createInput.description = 'Description';
  createInput.fileId = new Types.ObjectId().toHexString();
  generateInput._id = experiment._id.toHexString();
  generateInput.stages = [stageSelection];
  edge._id = new Types.ObjectId();
  edge.from = 'from';
  edge.to = 'to';
  stageSelection.stage = ClassificationStage.CLASSIFICATION;
  stageSelection.technologyIds = ['tech-1'];
  historyItem.createdAt = now;
  historyItem.message = 'Optimizing';
  historyItem.status = OptimizationStatus.optimizing;
  updateInput._id = experiment._id.toHexString();
  updateInput.name = 'Updated';
  updateInput.description = 'Updated description';
  updateInput.fileId = null;
  updateInput.graphNodes = [nodeInput];
  updateInput.graphSettings = structureSettings;
  updateInput.graphComputationMode = ComputationMode.local;
  updateOptimizationInput.experimentId = experiment._id;
  updateOptimizationInput.bestPipelineId = new Types.ObjectId();
  updateOptimizationInput.score = 0.11;
  updateProgressInput.experimentId = experiment._id;
  updateProgressInput.progress = 80;
  updateProgressInput.message = 'Working';
  updateProgressInput.status = OptimizationStatus.optimizing;

  assert.ok(CLASSIFICATION_STAGE_VALUES.includes(ClassificationStage.CLASSIFICATION));
  assert.equal(CLASSIFICATION_TECHNOLOGIES[ClassificationStage.CLASSIFICATION][0], 'SVM');
  assert.equal(getDefaultTechnology(ClassificationStage.CLASSIFICATION), 'SVM');
  assert.equal(isTechnologyAllowed(ClassificationStage.CLASSIFICATION, 'CNN'), true);
  assert.equal(isTechnologyAllowed(ClassificationStage.CLASSIFICATION, 'KNN'), false);
  assert.ok(EXPERIMENT_STATUS_VALUES.includes(ExperimentStatus.completed));
  assert.equal(ExperimentModel.modelName, 'Experiment');
  assert.equal(GraphStructureModel.modelName, 'GraphStructure');
  assert.equal(experiment.optimization?.status, OptimizationStatus.optimizing);
  assert.equal(updateInput.graphComputationMode, ComputationMode.local);
  assert.equal(edge.to, 'to');
});

test('ExperimentManager handles list, getById and create flows', async (t) => {
  const manager = new ExperimentManager();
  const userId = new Types.ObjectId().toHexString();
  const fileId = new Types.ObjectId().toHexString();
  const experimentId = new Types.ObjectId();
  const experiments = [{ _id: experimentId }];
  const createCalls: any[] = [];
  const workflowCalls: any[] = [];
  const graphCalls: any[] = [];

  stub(t, ExperimentModel as unknown as Record<string, unknown>, 'find', (query: any) => {
    assert.deepEqual(query, { createdById: userId });
    return {
      sort(sortBy: any) {
        assert.deepEqual(sortBy, { createdAt: -1 });
        return {
          lean: async () => experiments,
        };
      },
    };
  });
  stub(t, ExperimentModel as unknown as Record<string, unknown>, 'findOne', (query: any) =>
    createLeanResult(query._id ? { _id: query._id } : null)
  );
  stub(t, ExperimentModel as unknown as Record<string, unknown>, 'create', async (payload: any) => {
    createCalls.push(payload);
    return {
      _id: experimentId,
      toObject: ({ getters }: { getters: boolean }) => ({ getters, _id: experimentId, ...payload }),
    };
  });
  stub(t, manager as unknown as Record<string, unknown>, 'graphManager', {
    createDefaultGraph: async (...args: any[]) => {
      graphCalls.push(args);
    },
  } as any);
  stub(t, manager as unknown as Record<string, unknown>, 'workflowManager', {
    create: async (...args: any[]) => {
      workflowCalls.push(args);
      return true;
    },
  } as any);

  assert.equal(await manager.list(userId), experiments);
  assert.deepEqual(await manager.getById('exp-1', userId), { _id: 'exp-1' });

  const created: any = await manager.create(
    { name: '  Experiment ', description: ' Desc ', fileId } as any,
    userId
  );

  assert.equal(createCalls.length, 1);
  assert.equal(createCalls[0].name, 'Experiment');
  assert.equal(createCalls[0].description, 'Desc');
  assert.ok(createCalls[0].fileId instanceof Types.ObjectId);
  assert.ok(createCalls[0].createdById instanceof Types.ObjectId);
  assert.deepEqual(graphCalls, [[experimentId]]);
  assert.equal(workflowCalls[0][0].status, ExperimentStatus.creating);
  assert.equal(created.getters, true);
});

test('ExperimentManager handles update, generateGraph and optimization updates', async (t) => {
  const manager = new ExperimentManager();
  const userId = new Types.ObjectId().toHexString();
  const experimentId = new Types.ObjectId().toHexString();
  const fileId = new Types.ObjectId();
  const graphNodes = [{ _id: 'node-1' }];
  const graphSettings = {
    metrics: { accuracy: 0.25, f1: 0.25, rocAuc: 0.25, ntps: 0.25 },
    queues: [ComputationQueue.local],
    folds: 5,
  };
  const updateCalls: any[] = [];
  const graphCalls: any[] = [];
  const workflowCalls: any[] = [];

  stub(t, ExperimentModel as unknown as Record<string, unknown>, 'findOne', (query: any) => {
    if (query.createdById) return createLeanResult({ _id: query._id, createdById: userId });
    return createLeanResult({ _id: experimentId });
  });
  stub(t, ExperimentModel as unknown as Record<string, unknown>, 'findById', () =>
    createLeanResult({ _id: experimentId })
  );
  stub(
    t,
    ExperimentModel as unknown as Record<string, unknown>,
    'findOneAndUpdate',
    (query: any, payload: any) => {
      updateCalls.push([query, payload]);
      return createLeanResult({ _id: experimentId, name: 'Updated experiment' });
    }
  );
  stub(t, ExperimentModel as unknown as Record<string, unknown>, 'updateOne', (...args: any[]) => {
    updateCalls.push(args);
    return createLeanResult({ acknowledged: true });
  });
  stub(t, manager as unknown as Record<string, unknown>, 'graphManager', {
    updateGraph: async (...args: any[]) => {
      graphCalls.push(['updateGraph', ...args]);
    },
    updateGraphSettings: async (...args: any[]) => {
      graphCalls.push(['updateGraphSettings', ...args]);
    },
    updateComputationMode: async (...args: any[]) => {
      graphCalls.push(['updateComputationMode', ...args]);
    },
    generateGraphFromSelections: async (...args: any[]) => {
      graphCalls.push(['generateGraphFromSelections', ...args]);
    },
  } as any);
  stub(t, manager as unknown as Record<string, unknown>, 'workflowManager', {
    getWorkflow: async (...args: any[]) => {
      workflowCalls.push(args);
      return { status: ExperimentStatus.configuring };
    },
    changeStatus: async (payload: any) => {
      const transition = payload.transitions.find(
        (entry: any) =>
          entry.from === ExperimentStatus.configuring && entry.to === ExperimentStatus.computing
      );
      await transition.sideEffect({ instanceId: payload.instanceId });
      return true;
    },
  } as any);
  stub(t, manager as unknown as Record<string, unknown>, 'pipelineManager', {
    generatePipelinesFromGraphStructure: async (...args: any[]) => {
      graphCalls.push(['generatePipelinesFromGraphStructure', ...args]);
    },
  } as any);
  stub(t, UploadedFileModel as unknown as Record<string, unknown>, 'findById', () =>
    createLeanResult({ _id: fileId, storageKey: 'uploads/eeg.csv' })
  );
  stub(t, manager as unknown as Record<string, unknown>, 'getById', async (id: string) => ({
    _id: id,
    fileId,
    optimization: {},
  }));

  const updated = await manager.update(
    {
      _id: experimentId,
      name: '  Updated experiment ',
      description: '  New description ',
      fileId: '',
      graphNodes,
      graphSettings,
      graphComputationMode: ComputationMode.cloud,
    } as any,
    userId
  );

  assert.equal((updated as any).name, 'Updated experiment');
  assert.deepEqual(graphCalls.slice(0, 3), [
    ['updateGraph', experimentId, graphNodes],
    ['updateGraphSettings', experimentId, graphSettings],
    ['updateComputationMode', experimentId, ComputationMode.cloud],
  ]);
  assert.deepEqual(updateCalls[0][1], {
    $set: { name: 'Updated experiment', description: 'New description' },
    $unset: { fileId: 1 },
  });

  const generated = await manager.generateGraph(
    {
      _id: experimentId,
      stages: [{ stage: ClassificationStage.CLASSIFICATION, technologyIds: ['1'] }],
    } as any,
    userId
  );
  assert.equal((generated as any)._id, experimentId);
  assert.deepEqual(graphCalls[3], [
    'generateGraphFromSelections',
    experimentId,
    [{ stage: ClassificationStage.CLASSIFICATION, technologyIds: ['1'] }],
  ]);

  assert.equal(
    await manager.changeStatus({
      experimentId,
      status: ExperimentStatus.computing,
    } as any),
    true
  );
  assert.deepEqual(graphCalls[4], ['generatePipelinesFromGraphStructure', experimentId]);

  await manager.updateExperimentProgress({
    experimentId,
    progress: 80,
    message: 'Optimizing',
    status: OptimizationStatus.optimizing,
  } as any);
  await manager.updateExperimentOptimizationResult({
    experimentId,
    bestPipelineId: new Types.ObjectId().toHexString(),
    score: 0.15,
  } as any);

  assert.equal(workflowCalls.length >= 2, true);
});

test('Experiments resolver delegates queries, field resolvers and mutations', async (t) => {
  const resolver = new Experiments();
  const experiment = { _id: new Types.ObjectId(), name: 'Experiment' };
  const user = { _id: new Types.ObjectId() };
  const calls: any[] = [];
  const graphResult = { _id: new Types.ObjectId() };

  stub(t, resolver as unknown as Record<string, unknown>, 'auth', {
    me: async () => user,
  } as any);
  stub(t, resolver as unknown as Record<string, unknown>, 'manager', {
    list: async (...args: any[]) => {
      calls.push(['list', ...args]);
      return [experiment];
    },
    getById: async (...args: any[]) => {
      calls.push(['getById', ...args]);
      return experiment;
    },
    create: async (...args: any[]) => {
      calls.push(['create', ...args]);
      return experiment;
    },
    update: async (...args: any[]) => {
      calls.push(['update', ...args]);
      return experiment;
    },
    generateGraph: async (...args: any[]) => {
      calls.push(['generateGraph', ...args]);
      return experiment;
    },
  } as any);
  stub(t, resolver as unknown as Record<string, unknown>, 'graphManager', {
    getByExperimentId: async (...args: any[]) => {
      calls.push(['graph', ...args]);
      return graphResult;
    },
  } as any);
  stub(t, resolver as unknown as Record<string, unknown>, 'workflowManager', {
    getWorkflow: async (...args: any[]) => {
      calls.push(['workflow', ...args]);
      return { status: ExperimentStatus.creating };
    },
  } as any);
  stub(t, resolver as unknown as Record<string, unknown>, 'experimentManager', {
    changeStatus: async (...args: any[]) => {
      calls.push(['changeStatus', ...args]);
      return true;
    },
    updateExperimentProgress: async (...args: any[]) => {
      calls.push(['updateProgress', ...args]);
      return experiment;
    },
    updateExperimentOptimizationResult: async (...args: any[]) => {
      calls.push(['updateOptimization', ...args]);
      return experiment;
    },
  } as any);

  assert.equal(await resolver.graph(experiment as any), graphResult);
  assert.equal(await resolver.status(experiment as any), ExperimentStatus.creating);
  assert.deepEqual(await resolver.experiments({ req: {} } as any), [experiment]);
  assert.equal(
    await resolver.experiment(experiment._id.toString(), { req: {} } as any),
    experiment
  );
  assert.equal(
    await resolver.createExperiment({ name: 'Experiment' } as any, { req: {} } as any),
    experiment
  );
  assert.equal(
    await resolver.updateExperiment(
      { _id: experiment._id.toString(), name: 'Updated' } as any,
      { req: {} } as any
    ),
    experiment
  );
  assert.equal(
    await resolver.generateExperimentGraph(
      { _id: experiment._id.toString(), stages: [] } as any,
      { req: {} } as any
    ),
    experiment
  );
  assert.equal(
    await resolver.changeExperimentStatus(
      { experimentId: experiment._id.toString(), status: ExperimentStatus.configuring } as any,
      { req: {} } as any
    ),
    true
  );
  assert.equal(
    await resolver.updateExperimentProgress({ experimentId: experiment._id.toString() } as any),
    true
  );
  assert.equal(
    await resolver.updateExperimentOptimizationResult({
      experimentId: experiment._id.toString(),
      bestPipelineId: 'p',
      score: 1,
    } as any),
    true
  );
});

test('buildGraphReportPdf renders html and returns a pdf buffer', async (t) => {
  let capturedHtml = '';
  let closed = false;

  stub(t, puppeteer as unknown as Record<string, unknown>, 'launch', async () => ({
    newPage: async () => ({
      setContent: async (html: string) => {
        capturedHtml = html;
      },
      pdf: async () => new Uint8Array(Buffer.from('pdf-data')),
    }),
    close: async () => {
      closed = true;
    },
  }));

  const buffer = await buildGraphReportPdf({
    experimentId: 'exp-1',
    experimentName: 'Signal Analysis',
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    nodes: [
      {
        _id: 'node-1',
        label: 'CSP',
        technology: 'CSP',
        stage: ClassificationStage.PREPROCESSING,
        type: 'technology',
      },
      {
        _id: 'node-2',
        label: 'SVM',
        technology: 'SVM',
        stage: ClassificationStage.CLASSIFICATION,
        parentId: 'node-1',
        type: 'technology',
        settings: [{ key: 'kernel', value: 'rbf' }],
      },
    ] as any,
    graph: {
      settings: {
        metrics: { accuracy: 0.25, f1: 0.25, rocAuc: 0.25, ntps: 0.25 },
        queues: ['local'],
        folds: 5,
        hyperOptimizationMinutesPerPipeline: 30,
        predictDataPercent: 20,
      },
      computationMode: 'local',
    },
    file: {
      filename: 'dataset.csv',
      sizeMb: 12,
      status: 'uploaded',
      uploadedAt: new Date('2025-01-01T00:00:00.000Z'),
      uploadedByName: 'Ivan',
    },
    pipelines: [
      {
        _id: 'pipeline-1',
        queue: 'local',
        pathNodeIds: ['node-1', 'node-2'],
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-02T00:00:00.000Z'),
        computingResult: {
          accuracyScores: [0.91],
          f1Scores: [0.88],
          rocAucScores: [0.93],
          optimizationIntermediateScores: [0.2, 0.15],
          sampleCount: 100,
          duration: 12.3,
          confusionMatrixes: [
            [
              [90, 10],
              [8, 92],
            ],
          ],
          channelNames: ['A', 'B'],
        },
        optimizationScores: [0.15],
        machineInfo: {
          hostname: 'host-1',
          platform: 'linux',
          arch: 'x64',
          release: '6.0',
          cpuModel: 'CPU',
          cores: 8,
          memoryGb: 16,
        },
      },
    ],
    optimization: {
      bestPipelineId: 'pipeline-1',
      bestScore: 0.15,
    },
  });

  assert.ok(Buffer.isBuffer(buffer));
  assert.match(capturedHtml, /Signal Analysis/);
  assert.match(capturedHtml, /Найефективніший конвеєр/);
  assert.equal(closed, true);
});
