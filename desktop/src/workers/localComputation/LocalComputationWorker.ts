import os from 'node:os';
import { app } from 'electron';
import {
  PipelineMachineInfoInput,
  ComputationQueue,
  PipelineStatus,
} from '../../graphql/types.generated';
import { createGraphqlClient, GraphqlClient, isFetchAvailable } from './graphqlClient';
import {
  changePipelineStatus,
  claimExperimentRun,
  fetchExperimentForRun,
  fetchExperimentRun,
} from './graphqlOperations';
import { buildHandlerPayload } from './payloadBuilder';
import { runPythonHandler, warmupLocalDockerImage } from './pythonRunner';

const DEFAULT_POLL_MS = 3000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
type ClaimedRun = NonNullable<Awaited<ReturnType<typeof claimExperimentRun>>>;

export class LocalComputationWorker {
  private running = false;
  private stopping = false;
  private client: GraphqlClient | null = null;
  private cachedMachineInfo: PipelineMachineInfoInput | null = null;

  start() {
    if (this.running) return;
    if (!isFetchAvailable()) {
      console.warn('Fetch is not available in the main process; local worker disabled.');
      return;
    }
    this.stopping = false;
    this.client = createGraphqlClient();
    void warmupLocalDockerImage({
      onLog: async (message) => {
        console.log(message);
      },
    }).catch((error) => {
      console.warn('Local worker image warmup failed', error);
    });
    void this.loop();
  }

  stop() {
    this.stopping = true;
  }

  private async loop() {
    this.running = true;
    const pollMs = Number(process.env.LOCAL_WORKER_POLL_MS ?? DEFAULT_POLL_MS);

    while (!this.stopping) {
      let run = null;
      try {
        run = await claimExperimentRun(
          this.requireClient(),
          ComputationQueue.local,
          this.getMachineInfo()
        );
      } catch (error) {
        console.warn('Local worker failed to claim a run', error);
        await sleep(pollMs);
        continue;
      }

      if (!run) {
        await sleep(pollMs);
        continue;
      }

      try {
        await this.processRun(run);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Local computation failed';
        await changePipelineStatus(this.requireClient(), {
          pipelineId: run._id,
          status: PipelineStatus.failed,
          message,
        });
      }
    }

    this.running = false;
  }

  private async processRun(run: ClaimedRun) {
    const experiment = await fetchExperimentForRun(this.requireClient(), run.experimentId);
    if (!experiment) {
      throw new Error('Experiment not found');
    }

    const abortController = new AbortController();
    const stopWatcher = this.startPauseWatcher(run._id, abortController);
    const payload = buildHandlerPayload(run, experiment);

    try {
      await runPythonHandler(
        payload,
        { signal: abortController.signal },
        {
          onProgress: async (progress, message) => {
            if (abortController.signal.aborted) return;
            console.log({ statusMessage: message });
          },
          onLog: async (message) => {
            if (abortController.signal.aborted) return;
            console.log({ statusMessage: message });
          },
          onError: async (message) => {
            if (abortController.signal.aborted) return;
            console.log({ statusMessage: message });
            await changePipelineStatus(this.requireClient(), {
              pipelineId: run._id,
              status: PipelineStatus.failed,
              message,
            });
          },
        }
      );

      if (abortController.signal.aborted) return;
    } catch (error) {
      if (abortController.signal.aborted) return;
      throw error;
    } finally {
      stopWatcher();
    }
  }

  private startPauseWatcher(runId: string, controller: AbortController) {
    let stopped = false;
    const pollMs = Number(process.env.LOCAL_WORKER_STATUS_POLL_MS ?? DEFAULT_POLL_MS);
    const loop = async () => {
      while (!stopped && !controller.signal.aborted) {
        if (this.stopping) {
          controller.abort();
          return;
        }
        await sleep(pollMs);
        if (stopped || controller.signal.aborted) return;
        try {
          const run = await fetchExperimentRun(this.requireClient(), runId);
          if (run?.status === 'paused') {
            controller.abort();
            return;
          }
        } catch (error) {
          console.warn('Local worker failed to poll run status', error);
        }
      }
    };
    void loop();
    return () => {
      stopped = true;
    };
  }

  private requireClient() {
    if (!this.client) {
      throw new Error('GraphQL client is not initialized');
    }
    return this.client;
  }

  private getMachineInfo(): PipelineMachineInfoInput {
    if (this.cachedMachineInfo) return this.cachedMachineInfo;
    const cpus = os.cpus();
    const cpuModel = cpus[0]?.model?.trim();
    const memoryGb = Math.round((os.totalmem() / 1024 ** 3) * 10) / 10;

    this.cachedMachineInfo = {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      cpuModel: cpuModel || undefined,
      cores: cpus.length || undefined,
      memoryGb: Number.isFinite(memoryGb) ? memoryGb : undefined,
      appVersion: app.getVersion(),
    };

    return this.cachedMachineInfo;
  }
}

export const localComputationWorker = new LocalComputationWorker();
