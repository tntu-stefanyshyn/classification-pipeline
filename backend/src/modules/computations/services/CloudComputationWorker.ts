import { BatchClient, SubmitJobCommand } from '@aws-sdk/client-batch';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import os from 'node:os';
import { Readable } from 'node:stream';
import { Types } from 'mongoose';
import { config } from '../../../config/config';
import { ComputationQueue } from '../classes/ComputationQueue';
import { ComputationStatus } from '../classes/ComputationStatus';
import { ComputationRunModel } from '../models/ComputationRunModel';
import { ComputationManager } from './ComputationManager';
import { ExperimentModel } from '../../experiments/models/ExperimentModel';
import { GraphStructureModel } from '../../experiments/models/GraphStructureModel';
import type { GraphNode } from '../../experiments/classes/GraphNode';

const DEFAULT_POLL_MS = 5000;

type HandlerPayload = {
  run_id: string;
  experiment_id: string;
  queue: string;
  file_id?: string | null;
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const streamToString = async (
  stream?: Readable | { transformToString?: () => Promise<string> }
) => {
  if (!stream) return '';
  if (typeof stream.transformToString === 'function') {
    return stream.transformToString();
  }
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    (stream as Readable)
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
  private readonly manager = new ComputationManager();
  private readonly batch: BatchClient;
  private readonly s3: S3Client;
  private readonly pollMs: number;
  private readonly jobQueue: string;
  private readonly jobDefinition: string;
  private readonly jobNamePrefix: string;
  private readonly resultsBucket: string;
  private readonly resultsPrefix: string;

  constructor() {
    this.pollMs = config.computations.cloudPollMs ?? DEFAULT_POLL_MS;
    this.jobQueue = config.aws.batchJobQueue;
    this.jobDefinition = config.aws.batchJobDefinition;
    this.jobNamePrefix = config.aws.batchJobNamePrefix || 'experiment-run';
    this.resultsBucket = config.aws.resultsBucket || config.s3.bucket;
    this.resultsPrefix = (config.aws.resultsPrefix || 'computations').replace(/^\/+|\/+$/g, '');

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
      region: config.aws.region || config.s3.region || undefined,
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
      console.warn('Cloud worker disabled: AWS Batch or results bucket is not configured.');
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
        console.warn('Cloud worker failed to reconcile runs', error);
      }

      let run = null;
      try {
        run = await this.manager.claimNextRun(ComputationQueue.cloud, this.buildMachineInfo());
      } catch (error) {
        console.warn('Cloud worker failed to claim a run', error);
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
    const runningRuns = await ComputationRunModel.find({
      queue: ComputationQueue.cloud,
      status: ComputationStatus.running,
    })
      .sort({ createdAt: 1 })
      .lean();

    for (const run of runningRuns) {
      const runId = String(run._id);
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

    const run = await ComputationRunModel.findById(runId).lean();
    if (!run) {
      throw new Error('Computation run not found');
    }
    if (run.status !== ComputationStatus.running) {
      return;
    }

    const experiment = await ExperimentModel.findById(run.experimentId).lean();
    if (!experiment) {
      throw new Error('Experiment not found');
    }

    const graph = await GraphStructureModel.findOne({ experimentId: run.experimentId }).lean();
    const nodes = graph?.nodes ?? [];
    if (nodes.length === 0) {
      throw new Error('Experiment graph is empty');
    }

    const payload = this.buildPayload(
      runId,
      experiment._id,
      experiment.fileId,
      nodes,
      run.pathNodeIds
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
    await ComputationRunModel.findOneAndUpdate(
      { _id: runId, status: ComputationStatus.running },
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
      run_id: runId,
      experiment_id: String(experimentId),
      queue: 'cloud',
      file_id: fileId ? String(fileId) : null,
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
      memoryGb: Math.round((os.totalmem() / (1024 ** 3)) * 10) / 10,
    };
  }
}
