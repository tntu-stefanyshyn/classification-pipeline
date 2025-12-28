import os from 'node:os';
import { app } from 'electron';
import { ComputationMachineInfoInput, ComputationQueue } from '../../graphql/types.generated';
import { createGraphqlClient, GraphqlClient, isFetchAvailable } from './graphqlClient';
import {
  claimExperimentRun,
  completeExperimentRun,
  failExperimentRun,
  fetchExperimentForRun,
  fetchExperimentRun,
  updateExperimentRun,
} from './graphqlOperations';
import { buildHandlerPayload } from './payloadBuilder';
import { runPythonHandler } from './pythonRunner';

const DEFAULT_POLL_MS = 3000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
type ClaimedRun = NonNullable<Awaited<ReturnType<typeof claimExperimentRun>>>;

export class LocalComputationWorker {
  private running = false;
  private stopping = false;
  private client: GraphqlClient | null = null;
  private cachedMachineInfo: ComputationMachineInfoInput | null = null;

  start() {
    if (this.running) return;
    if (!isFetchAvailable()) {
      console.warn('Fetch is not available in the main process; local worker disabled.');
      return;
    }
    this.stopping = false;
    this.client = createGraphqlClient();
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
        await this.failRun(run._id, message);
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
      const result = await runPythonHandler(
        payload,
        { signal: abortController.signal },
        {
          onProgress: async (progress, message) => {
            if (abortController.signal.aborted) return;
            await this.updateRun(run._id, { progress, statusMessage: message });
          },
          onLog: async (message) => {
            if (abortController.signal.aborted) return;
            await this.updateRun(run._id, { statusMessage: message });
          },
          onError: async (message) => {
            if (abortController.signal.aborted) return;
            await this.updateRun(run._id, { statusMessage: message });
          },
        }
      );

      if (abortController.signal.aborted) return;
      await this.completeRun(run._id, result);
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

  private async updateRun(runId: string, update: { progress?: number; statusMessage?: string }) {
    const input: { runId: string; progress?: number; statusMessage?: string } = { runId };

    if (typeof update.progress === 'number' && Number.isFinite(update.progress)) {
      input.progress = Math.max(0, Math.min(100, Math.round(update.progress)));
    }
    if (typeof update.statusMessage === 'string') {
      const message = update.statusMessage.trim();
      if (message) {
        input.statusMessage = message;
      }
    }

    if (input.progress === undefined && !input.statusMessage) return;
    await updateExperimentRun(this.requireClient(), input);
  }

  private async completeRun(runId: string, result: Record<string, unknown> | null) {
    const input: { runId: string; resultJson?: string } = { runId };
    if (result) {
      input.resultJson = JSON.stringify(result);
    }
    await completeExperimentRun(this.requireClient(), input);
  }

  private async failRun(runId: string, message: string) {
    await failExperimentRun(this.requireClient(), {
      runId,
      statusMessage: message,
    });
  }

  private requireClient() {
    if (!this.client) {
      throw new Error('GraphQL client is not initialized');
    }
    return this.client;
  }

  private getMachineInfo(): ComputationMachineInfoInput {
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
