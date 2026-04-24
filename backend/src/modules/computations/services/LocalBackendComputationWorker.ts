import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config } from '../../../config/config';
import { WorkflowType } from '../../../core/workflow/enums';
import { WorkflowManager } from '../../../core/workflow/services/WorkflowManager';
import { PipelineStatus } from '../../../core/pipeline/enums';
import { pipelinesCollectionName } from '../../../core/pipeline';
import { WorkflowModel } from '../../../core/workflow/model/WorkflowModel';
import { sleep } from '../../../utils';
import { ComputationQueue } from '../classes/ComputationQueue';
import { ComputationManager } from './ComputationManager';

const DEFAULT_POLL_MS = 3000;
const DOCKER_STOP_TIMEOUT_MS = 2000;
const IDLE_LOG_INTERVAL_MS = 30000;

export class LocalBackendComputationWorker {
  private running = false;
  private stopping = false;
  private imageReadyPromise: Promise<void> | null = null;
  private lastIdleLogAt = 0;
  private readonly queue = ComputationQueue.cloud;
  private readonly activeControllers = new Map<string, AbortController>();
  private readonly workflowManager = new WorkflowManager();
  private readonly manager = new ComputationManager();
  private readonly pollMs: number;
  private readonly dockerImage: string;

  constructor() {
    this.pollMs = config.computations.localPollMs ?? DEFAULT_POLL_MS;
    this.dockerImage = config.computations.localDockerImage || 'aws-jobs';
  }

  start() {
    console.log('Запуск локального backend-воркера для обчислень...');
    if (this.running) return;
    this.stopping = false;
    void this.loop();
  }

  stop() {
    this.stopping = true;
    this.activeControllers.forEach((controller) => controller.abort());
  }

  private async loop() {
    this.running = true;
    try {
      await this.ensureDockerImageReady();
      console.log(
        `Локальний backend-воркер готовий: polling=${this.pollMs}ms, dockerImage="${this.dockerImage}".`
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'невідома помилка підготовки docker-образу';
      console.warn(`Локальний backend-воркер вимкнено: ${message}`);
      this.running = false;
      return;
    }

    while (!this.stopping) {
      let run = null;
      try {
        run = await this.manager.claimNextRun(this.queue, this.buildMachineInfo());
      } catch (error) {
        console.warn('Локальний backend-воркер не зміг отримати запуск з черги', error);
        await sleep(this.pollMs);
        continue;
      }

      if (run) {
        const runId = run._id.toString();
        this.lastIdleLogAt = 0;
        console.log(
          `[local-backend-worker][${runId}] Взято в обробку backend-обчислення з cloud черги.`
        );
        await this.processRun(runId);
      } else {
        await this.logIdleQueueState();
      }

      await sleep(this.pollMs);
    }

    this.running = false;
  }

  private async processRun(runId: string) {
    const abortController = new AbortController();
    this.activeControllers.set(runId, abortController);
    const stopWatcher = this.startStatusWatcher(runId, abortController);

    try {
      await this.runComputeContainer(runId, abortController.signal);
      if (abortController.signal.aborted) {
        await this.recoverAbortedRun(runId);
        return;
      }

      const workflow = await this.getWorkflow(runId);
      if (workflow?.status === PipelineStatus.running) {
        await this.manager.failRun({
          runId,
          statusMessage: 'Локальний запуск завершився без фінального статусу.',
        });
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        await this.recoverAbortedRun(runId);
        return;
      }
      const message =
        error instanceof Error ? error.message : 'Локальне обчислення завершилось з помилкою';
      await this.manager.failRun({ runId, statusMessage: message });
    } finally {
      stopWatcher();
      this.activeControllers.delete(runId);
    }
  }

  private async recoverAbortedRun(runId: string) {
    const workflow = await this.getWorkflow(runId);
    if (!workflow) return;
    if (workflow.status === PipelineStatus.running && this.stopping) {
      await this.manager.failRun({
        runId,
        statusMessage: 'Локальний backend-воркер зупинено.',
      });
    }
  }

  private startStatusWatcher(runId: string, controller: AbortController) {
    let stopped = false;
    const loop = async () => {
      while (!stopped && !controller.signal.aborted) {
        if (this.stopping) {
          controller.abort();
          return;
        }
        await sleep(this.pollMs);
        if (stopped || controller.signal.aborted) return;

        const workflow = await this.getWorkflow(runId);
        if (!workflow || workflow.status !== PipelineStatus.running) {
          controller.abort();
          return;
        }
      }
    };
    void loop();

    return () => {
      stopped = true;
    };
  }

  private async runComputeContainer(runId: string, signal?: AbortSignal) {
    const backendUrl = this.resolveContainerBackendUrl();
    console.log(
      `[local-backend-worker][${runId}] Запускаю Docker image "${this.dockerImage}" для обчислення.`
    );
    const runArgs: string[] = [
      'run',
      '--rm',
      '-i',
      '--env',
      `COMPUTE_PAYLOAD_JSON=${JSON.stringify({ pipelineId: runId })}`,
      '--env',
      `COMPUTE_BACKEND_URL=${backendUrl}`,
    ];

    if (config.backend.serviceToken) {
      runArgs.push('--env', `COMPUTE_BACKEND_TOKEN=${config.backend.serviceToken}`);
    }
    if (os.platform() === 'linux' && backendUrl.includes('host.docker.internal')) {
      runArgs.push('--add-host', 'host.docker.internal:host-gateway');
    }
    runArgs.push(this.dockerImage);

    await new Promise<void>((resolve, reject) => {
      let aborted = false;
      let abortTimer: NodeJS.Timeout | null = null;
      let stderrBuffer = '';

      const proc = spawn('docker', runArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      proc.stdout.on('data', (chunk: Buffer) => {
        const line = chunk.toString().trim();
        if (line) {
          console.log(`[local-backend-worker][${runId}] ${line}`);
        }
      });
      proc.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderrBuffer += text;
        const line = text.trim();
        if (line) {
          console.warn(`[local-backend-worker][${runId}] ${line}`);
        }
      });

      const cleanupSignal = () => {
        if (abortTimer) {
          clearTimeout(abortTimer);
          abortTimer = null;
        }
        if (signal) {
          signal.removeEventListener('abort', handleAbort);
        }
      };

      const handleAbort = () => {
        if (aborted) return;
        aborted = true;
        if (!proc.killed) {
          proc.kill('SIGTERM');
        }
        abortTimer = setTimeout(() => {
          if (!proc.killed) {
            proc.kill('SIGKILL');
          }
        }, DOCKER_STOP_TIMEOUT_MS);
      };

      if (signal) {
        if (signal.aborted) {
          handleAbort();
        } else {
          signal.addEventListener('abort', handleAbort);
        }
      }

      proc.on('error', (error) => {
        cleanupSignal();
        reject(error);
      });
      proc.on('close', (code) => {
        cleanupSignal();
        if (aborted) {
          resolve();
          return;
        }
        if (code === 0) {
          resolve();
          return;
        }
        const message = stderrBuffer.trim() || `Docker exited with code ${code}`;
        reject(new Error(message));
      });
    });
  }

  private async logIdleQueueState() {
    const now = Date.now();
    if (now - this.lastIdleLogAt < IDLE_LOG_INTERVAL_MS) return;
    this.lastIdleLogAt = now;

    try {
      const summary = await this.getQueueSummary();
      const localQueued = summary.local?.queued ?? 0;
      const cloudQueued = summary.cloud?.queued ?? 0;
      const cloudRunning = summary.cloud?.running ?? 0;
      console.log(
        [
          'Локальний backend-воркер очікує cloud queued запусків.',
          `cloud queued=${cloudQueued}`,
          `cloud running=${cloudRunning}`,
          `local queued=${localQueued}`,
        ].join(' ')
      );
      if (cloudQueued === 0 && localQueued > 0) {
        console.warn(
          'У черзі є local-запуски. Їх виконує desktop local worker; backend worker бере cloud чергу.'
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'невідома помилка читання стану черги';
      console.warn(`Локальний backend-воркер не зміг прочитати стан черги: ${message}`);
    }
  }

  private async getQueueSummary() {
    type QueueSummary = Partial<Record<ComputationQueue, Partial<Record<PipelineStatus, number>>>>;
    const rows = await WorkflowModel.aggregate<{
      _id: { queue: ComputationQueue; status: PipelineStatus };
      count: number;
    }>([
      {
        $match: {
          type: WorkflowType.PIPELINE,
          status: { $in: [PipelineStatus.idle, PipelineStatus.queued, PipelineStatus.running] },
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
      {
        $group: {
          _id: { queue: '$pipeline.queue', status: '$status' },
          count: { $sum: 1 },
        },
      },
    ]);

    return rows.reduce<QueueSummary>((summary, row) => {
      const queue = row._id.queue;
      const status = row._id.status;
      summary[queue] = summary[queue] ?? {};
      summary[queue][status] = row.count;
      return summary;
    }, {});
  }

  private resolveContainerBackendUrl() {
    const fallback = `http://host.docker.internal:${config.port}/graphql`;
    const raw = config.backend.graphqlUrl?.trim() || fallback;
    try {
      const parsed = new URL(raw);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        parsed.hostname = 'host.docker.internal';
      }
      return parsed.toString();
    } catch {
      return raw;
    }
  }

  private async ensureDockerImageReady() {
    if (this.imageReadyPromise) return this.imageReadyPromise;

    this.imageReadyPromise = (async () => {
      const imageExists = await this.dockerImageExists();
      if (imageExists) return;

      const awsJobsDir = this.resolveAwsJobsDir();
      if (!awsJobsDir) {
        throw new Error(
          `Docker image "${this.dockerImage}" is missing and aws-jobs directory was not found.`
        );
      }

      console.log(
        `Локальний backend-воркер: образ "${this.dockerImage}" відсутній, збираю з ${awsJobsDir}...`
      );
      await this.runDockerCommand(['build', '-t', this.dockerImage, awsJobsDir]);
    })().catch((error) => {
      this.imageReadyPromise = null;
      throw error;
    });

    return this.imageReadyPromise;
  }

  private resolveAwsJobsDir() {
    const configuredDir = process.env.AWS_JOBS_DIR?.trim();
    const candidates = [
      configuredDir,
      path.resolve(process.cwd(), '../aws-jobs'),
      path.resolve(process.cwd(), 'aws-jobs'),
      path.resolve(__dirname, '../../../../../aws-jobs'),
    ].filter((candidate): candidate is string => Boolean(candidate));

    return (
      candidates.find((candidate) => fs.existsSync(path.join(candidate, 'Dockerfile'))) ?? null
    );
  }

  private dockerImageExists() {
    return new Promise<boolean>((resolve, reject) => {
      const proc = spawn('docker', ['image', 'inspect', this.dockerImage], {
        stdio: 'ignore',
      });
      proc.on('error', reject);
      proc.on('close', (code) => resolve(code === 0));
    });
  }

  private runDockerCommand(args: string[]) {
    return new Promise<void>((resolve, reject) => {
      let stderrBuffer = '';
      const proc = spawn('docker', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      proc.stdout.on('data', (chunk: Buffer) => {
        const line = chunk.toString().trim();
        if (line) {
          console.log(`[local-backend-worker] ${line}`);
        }
      });
      proc.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderrBuffer += text;
        const line = text.trim();
        if (line) {
          console.warn(`[local-backend-worker] ${line}`);
        }
      });
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(stderrBuffer.trim() || `Docker command failed with code ${code}`));
      });
    });
  }

  private getWorkflow(runId: string) {
    return this.workflowManager
      .getWorkflow({
        instanceId: runId,
        type: WorkflowType.PIPELINE,
      })
      .catch((error) => {
        console.warn('Локальний backend-воркер не зміг отримати workflow запуску', error);
        return null;
      });
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
