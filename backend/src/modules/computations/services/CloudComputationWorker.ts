import { BatchClient, SubmitJobCommand } from '@aws-sdk/client-batch';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import os from 'node:os';
import { Readable } from 'node:stream';
import { Types } from 'mongoose';
import { config } from '../../../config/config';
import { ComputationQueue } from '../classes/ComputationQueue';
import { ComputationManager } from './ComputationManager';
import { ExperimentModel } from '../../experiments/models/ExperimentModel';
import { GraphStructureModel } from '../../experiments/models/GraphStructureModel';
import { UploadedFileModel } from '../../files/models/UploadedFileModel';
import type { GraphNode } from '../../experiments/classes/GraphNode';
import { WorkflowModel } from '../../../core/workflow/model/WorkflowModel';
import { WorkflowType } from '../../../core/workflow/enums';
import { PipelineStatus } from '../../../core/pipeline/enums';
import {
  PipelineBaseService,
  PipelineModel,
  pipelinesCollectionName,
} from '../../../core/pipeline';
import { WorkflowManager } from '../../../core/workflow/services/WorkflowManager';
import { sleep } from '../../../utils';

const DEFAULT_POLL_MS = 5000;

type HandlerPayload = {
  pipelineId: string;
  experiment_id: string;
  queue: string;
  file_id?: string | null;
  file_s3_bucket?: string;
  file_s3_key?: string;
  result_s3_bucket?: string;
  result_s3_key?: string;
  path: Array<{
    node_id: string;
    stage: string;
    technology: string;
    settings: Array<{ key: string; value: string }>;
  }>;
};

type ResultPayload =
  | { status: 'completed'; result: Record<string, unknown>; completed_at?: string }
  | { status: 'failed'; error: string; failed_at?: string };

type TransformableStream = { transformToString: () => Promise<string> };

const hasTransformToString = (value: unknown): value is TransformableStream =>
  typeof (value as TransformableStream | undefined)?.transformToString === 'function';

const streamToString = async (stream?: Readable | TransformableStream) => {
  if (!stream) return '';
  if (hasTransformToString(stream)) {
    return stream.transformToString();
  }
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream
      .on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      .on('error', (error) => reject(error))
      .on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
};

const isMissingKeyError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const maybeError = error as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  if (maybeError.$metadata?.httpStatusCode === 404) return true;
  return maybeError.name === 'NoSuchKey' || maybeError.Code === 'NoSuchKey';
};

export class CloudComputationWorker {
  private running = false;
  private stopping = false;
  private readonly workflowManager = new WorkflowManager();
  private readonly manager = new ComputationManager();
  private readonly batch: BatchClient;
  private readonly s3: S3Client;
  private readonly pollMs: number;
  private readonly jobQueue: string;
  private readonly jobDefinition: string;
  private readonly jobNamePrefix: string;
  private readonly inputBucket: string;
  private readonly resultsBucket: string;
  private readonly resultsPrefix: string;

  constructor() {
    this.pollMs = config.computations.cloudPollMs ?? DEFAULT_POLL_MS;
    this.jobQueue = config.aws.batchJobQueue;
    this.jobDefinition = config.aws.batchJobDefinition;
    this.jobNamePrefix = config.aws.batchJobNamePrefix || 'experiment-run';
    this.inputBucket = config.s3.bucket;
    this.resultsBucket = config.aws.resultsBucket || config.s3.bucket;
    this.resultsPrefix = (config.aws.resultsPrefix || 'computations').replace(/^\/+|\/+$/g, '');
    const resultsRegion =
      config.aws.resultsRegion || config.aws.region || config.s3.region || undefined;

    this.batch = new BatchClient({
      region: config.aws.region || config.s3.region || undefined,
      credentials:
        config.aws.accessKeyId && config.aws.secretAccessKey
          ? {
              accessKeyId: config.aws.accessKeyId,
              secretAccessKey: config.aws.secretAccessKey,
            }
          : undefined,
    });
    this.s3 = new S3Client({
      region: resultsRegion,
      credentials:
        config.aws.accessKeyId && config.aws.secretAccessKey
          ? {
              accessKeyId: config.aws.accessKeyId,
              secretAccessKey: config.aws.secretAccessKey,
            }
          : undefined,
    });
  }

  start() {
    if (this.running) return;
    if (!this.jobQueue || !this.jobDefinition || !this.resultsBucket) {
      console.warn('Хмарний воркер вимкнено: AWS Batch або bucket для результатів не налаштовано.');
      return;
    }
    this.stopping = false;
    void this.loop();
  }

  stop() {
    this.stopping = true;
  }

  private async loop() {
    this.running = true;
    while (!this.stopping) {
      try {
        await this.reconcileRuns();
      } catch (error) {
        console.warn(
          'Хмарний воркер не зміг синхронізувати запуски',
          new Error(error as any).message
        );
      }

      let run = null;
      try {
        run = await this.manager.claimNextRun(ComputationQueue.cloud, this.buildMachineInfo());
      } catch (error) {
        console.warn('Хмарний воркер не зміг отримати запуск з черги', error);
        await sleep(this.pollMs);
        continue;
      }

      if (run) {
        try {
          await this.submitRun(run._id.toString());
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Не вдалося відправити в AWS';
          await this.manager.failRun({ runId: run._id.toString(), statusMessage: message });
        }
      }

      await sleep(this.pollMs);
    }
    this.running = false;
  }

  private async reconcileRuns() {
    const runnings = await WorkflowModel.aggregate([
      {
        $match: {
          type: WorkflowType.PIPELINE,
          status: PipelineStatus.running,
        },
      },
      {
        $lookup: {
          from: pipelinesCollectionName,
          localField: 'instanceId',
          foreignField: '_id',
          as: 'pipeline',
        },
      },
      { $unwind: '$pipeline' },
      { $match: { 'pipeline.queue': ComputationQueue.cloud } },
    ]);

    for (const run of runnings) {
      const runId = String((run as { pipeline?: { _id?: Types.ObjectId } }).pipeline?._id ?? '');
      if (!runId) continue;
      const resultPayload = await this.fetchResultPayload(runId);
      if (!resultPayload) continue;

      if (resultPayload.status === 'failed') {
        const message = resultPayload.error || 'Помилка виконання в AWS';
        await this.manager.failRun({ runId, statusMessage: message });
        continue;
      }

      const resultJson = JSON.stringify(resultPayload.result ?? {});
      await this.manager.completeRun({
        runId,
        resultJson,
        statusMessage: 'Виконано в AWS',
      });
    }
  }

  private async submitRun(runId: string) {
    if (!Types.ObjectId.isValid(runId)) {
      throw new Error(`Invalid run id: ${runId}`);
    }

    const pipeline = await PipelineBaseService.getById(runId);
    const workflow = await this.workflowManager.getWorkflow({
      instanceId: pipeline._id,
      type: WorkflowType.PIPELINE,
    });

    if (workflow.status !== PipelineStatus.running) {
      return;
    }

    const experiment = await ExperimentModel.findById(pipeline.experimentId).lean();
    if (!experiment) {
      throw new Error('Experiment not found');
    }

    const graph = await GraphStructureModel.findOne({ experimentId: pipeline.experimentId }).lean();
    const nodes = graph?.nodes ?? [];
    if (nodes.length === 0) {
      throw new Error('Experiment graph is empty');
    }

    let fileStorageKey: string | undefined;
    if (experiment.fileId) {
      const file = await UploadedFileModel.findById(experiment.fileId).lean();
      if (!file?.storageKey) {
        throw new Error('Experiment file not found');
      }
      fileStorageKey = file.storageKey;
      if (!this.inputBucket) {
        throw new Error('S3 bucket is not configured for experiment files');
      }
    }

    const payload = this.buildPayload(
      runId,
      experiment._id,
      experiment.fileId,
      fileStorageKey,
      nodes,
      pipeline.pathNodeIds
    );
    const payloadJson = JSON.stringify(payload);
    const submitResponse = await this.batch.send(
      new SubmitJobCommand({
        jobName: `${this.jobNamePrefix}-${runId}`,
        jobQueue: this.jobQueue,
        jobDefinition: this.jobDefinition,
        containerOverrides: {
          environment: [{ name: 'COMPUTE_PAYLOAD_JSON', value: payloadJson }],
        },
      })
    );

    const jobId = submitResponse.jobId ?? '';
    const statusMessage = jobId ? `AWS: ${jobId}` : 'Відправлено в AWS';
    await PipelineModel.findOneAndUpdate(
      { _id: runId },
      {
        $set: {
          statusMessage,
          ...(jobId ? { cloudJobId: jobId } : {}),
        },
      }
    ).lean();
  }

  private buildPayload(
    runId: string,
    experimentId: Types.ObjectId,
    fileId: Types.ObjectId | undefined,
    fileStorageKey: string | undefined,
    nodes: GraphNode[],
    pathNodeIds: Types.ObjectId[]
  ): HandlerPayload {
    const nodeMap = new Map(nodes.map((node) => [String(node._id), node]));
    const pathNodes = pathNodeIds.map((nodeId) => nodeMap.get(String(nodeId)) ?? null);
    if (pathNodes.some((node) => !node)) {
      throw new Error('Graph path nodes are missing');
    }

    const resultKey = this.getResultKey(runId);

    return {
      pipelineId: runId,
      experiment_id: String(experimentId),
      queue: 'cloud',
      file_id: fileId ? String(fileId) : null,
      ...(fileStorageKey && this.inputBucket
        ? { file_s3_bucket: this.inputBucket, file_s3_key: fileStorageKey }
        : {}),
      result_s3_bucket: this.resultsBucket,
      result_s3_key: resultKey,
      path: pathNodes.map((node) => ({
        node_id: String(node?._id ?? ''),
        stage: String(node?.stage ?? ''),
        technology: String(node?.technology ?? ''),
        settings: (node?.settings ?? []).map((setting) => ({
          key: String(setting.key ?? ''),
          value: String(setting.value ?? ''),
        })),
      })),
    };
  }

  private async fetchResultPayload(runId: string): Promise<ResultPayload | null> {
    const key = this.getResultKey(runId);
    try {
      const response = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.resultsBucket,
          Key: key,
        })
      );
      const body = await streamToString(response.Body as Readable);
      if (!body) return null;
      return JSON.parse(body) as ResultPayload;
    } catch (error) {
      if (isMissingKeyError(error)) return null;
      throw error;
    }
  }

  private getResultKey(runId: string) {
    return this.resultsPrefix ? `${this.resultsPrefix}/${runId}.json` : `${runId}.json`;
  }

  private buildMachineInfo() {
    const cpus = os.cpus();
    const cpuModel = cpus[0]?.model ?? '';
    return {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      cpuModel: cpuModel || undefined,
      cores: cpus.length || undefined,
      memoryGb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    };
  }
}
