import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { config } from '../config/config';

const DEFAULT_POLL_MS = 3000;
const DEFAULT_PYTHON_BIN = 'python3';
const DEFAULT_HANDLER_MODULE = 'aws_jobs.compute_handler';

const CLAIM_RUN_MUTATION = `
  mutation ClaimExperimentRun($queue: ComputationQueue!) {
    claimExperimentRun(queue: $queue) {
      _id
      experimentId
      queue
      status
      progress
      statusMessage
      pathNodeIds
    }
  }
`;

const UPDATE_RUN_MUTATION = `
  mutation UpdateExperimentRun($input: UpdateExperimentRunInput!) {
    updateExperimentRun(input: $input) {
      _id
    }
  }
`;

const COMPLETE_RUN_MUTATION = `
  mutation CompleteExperimentRun($input: CompleteExperimentRunInput!) {
    completeExperimentRun(input: $input) {
      _id
    }
  }
`;

const FAIL_RUN_MUTATION = `
  mutation FailExperimentRun($input: FailExperimentRunInput!) {
    failExperimentRun(input: $input) {
      _id
    }
  }
`;

const EXPERIMENT_QUERY = `
  query Experiment($id: ID!) {
    experiment(_id: $id) {
      _id
      fileId
      graph {
        nodes {
          _id
          stage
          technology
          settings {
            key
            value
          }
        }
      }
    }
  }
`;

type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

type ComputationRun = {
  _id: string;
  experimentId: string;
  queue: 'local' | 'cloud';
  status: string;
  progress?: number | null;
  statusMessage?: string | null;
  pathNodeIds: string[];
};

type ExperimentPayload = {
  experiment: {
    _id: string;
    fileId?: string | null;
    graph?: {
      nodes: GraphNode[];
    } | null;
  } | null;
};

type GraphNodeSetting = {
  key: string;
  value: string;
};

type GraphNode = {
  _id: string;
  stage: string;
  technology: string;
  settings?: GraphNodeSetting[] | null;
};

type HandlerPayload = {
  run_id: string;
  experiment_id: string;
  queue: string;
  file_id?: string | null;
  path: Array<{
    node_id: string;
    stage: string;
    technology: string;
    settings: Array<{ key: string; value: string }>;
  }>;
};

type HandlerEvent =
  | { type: 'progress'; progress?: number; message?: string }
  | { type: 'result'; result?: Record<string, unknown> }
  | { type: 'log'; message?: string }
  | { type: 'error'; message?: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getGraphqlEndpoint = () =>
  process.env.GRAPHQL_ENDPOINT ||
  process.env.VITE_GRAPHQL_ENDPOINT ||
  config.renderer.graphqlEndpoint ||
  'http://localhost:4000/graphql';

const graphqlRequest = async <T>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> => {
  if (typeof fetch !== 'function') {
    throw new Error('Fetch is not available in the main process');
  }
  const response = await fetch(getGraphqlEndpoint(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const payload = (await response.json()) as GraphQLResponse<T>;
  if (!response.ok) {
    const message = payload.errors?.[0]?.message;
    throw new Error(message ?? `GraphQL request failed (${response.status})`);
  }
  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message ?? 'GraphQL request failed');
  }
  if (!payload.data) {
    throw new Error('GraphQL response is empty');
  }
  return payload.data;
};

const resolvePythonPath = () => {
  const candidates = [
    process.cwd(),
    app.getAppPath(),
    path.resolve(app.getAppPath(), '..'),
    path.resolve(app.getAppPath(), '..', '..'),
  ];

  for (const candidate of candidates) {
    const handlerPath = path.join(candidate, 'aws-jobs', 'src', 'aws_jobs', 'compute_handler.py');
    if (fs.existsSync(handlerPath)) {
      return path.join(candidate, 'aws-jobs', 'src');
    }
  }

  return path.join(process.cwd(), 'aws-jobs', 'src');
};

export class LocalComputationWorker {
  private running = false;
  private stopping = false;

  start() {
    if (this.running) return;
    if (typeof fetch !== 'function') {
      console.warn('Fetch is not available in the main process; local worker disabled.');
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
    const pollMs = Number(process.env.LOCAL_WORKER_POLL_MS ?? DEFAULT_POLL_MS);

    while (!this.stopping) {
      let run: ComputationRun | null = null;
      try {
        run = await this.claimNextRun();
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

  private async claimNextRun(): Promise<ComputationRun | null> {
    const data = await graphqlRequest<{ claimExperimentRun: ComputationRun | null }>(
      CLAIM_RUN_MUTATION,
      { queue: 'local' }
    );
    return data.claimExperimentRun ?? null;
  }

  private async processRun(run: ComputationRun) {
    const experiment = await this.fetchExperiment(run.experimentId);
    if (!experiment) {
      throw new Error('Experiment not found');
    }
    const nodes = experiment.graph?.nodes ?? [];
    if (nodes.length === 0) {
      throw new Error('Experiment graph is empty');
    }

    const nodeMap = new Map(nodes.map((node) => [node._id, node]));
    const pathNodes = run.pathNodeIds.map((nodeId) => nodeMap.get(nodeId) ?? null);
    if (pathNodes.some((node) => !node)) {
      throw new Error('Graph path nodes are missing');
    }

    const payload: HandlerPayload = {
      run_id: run._id,
      experiment_id: run.experimentId,
      queue: run.queue,
      file_id: experiment.fileId ?? null,
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

    const result = await this.runPythonHandler(payload, run._id);
    await this.completeRun(run._id, result);
  }

  private async fetchExperiment(experimentId: string) {
    const data = await graphqlRequest<ExperimentPayload>(EXPERIMENT_QUERY, {
      id: experimentId,
    });
    return data.experiment ?? null;
  }

  private async updateRun(runId: string, update: { progress?: number; statusMessage?: string }) {
    const input: Record<string, unknown> = { runId };
    if (typeof update.progress === 'number' && Number.isFinite(update.progress)) {
      input.progress = Math.max(0, Math.min(100, Math.round(update.progress)));
    }
    if (typeof update.statusMessage === 'string') {
      input.statusMessage = update.statusMessage;
    }
    await graphqlRequest(UPDATE_RUN_MUTATION, { input });
  }

  private async completeRun(runId: string, result: Record<string, unknown> | null) {
    const input: Record<string, unknown> = { runId };
    if (result) {
      input.resultJson = JSON.stringify(result);
    }
    await graphqlRequest(COMPLETE_RUN_MUTATION, { input });
  }

  private async failRun(runId: string, message: string) {
    await graphqlRequest(FAIL_RUN_MUTATION, {
      input: { runId, statusMessage: message },
    });
  }

  private async runPythonHandler(
    payload: HandlerPayload,
    runId: string
  ): Promise<Record<string, unknown> | null> {
    const pythonBin = process.env.PYTHON_BIN ?? DEFAULT_PYTHON_BIN;
    const handlerModule = process.env.COMPUTE_HANDLER_MODULE ?? DEFAULT_HANDLER_MODULE;
    const pythonPath = resolvePythonPath();
    const envPythonPath = process.env.PYTHONPATH ?? '';
    const pythonEnv = {
      ...process.env,
      PYTHONPATH: [pythonPath, envPythonPath].filter(Boolean).join(path.delimiter),
    };

    return new Promise((resolve, reject) => {
      let result: Record<string, unknown> | null = null;
      const proc = spawn(pythonBin, ['-m', handlerModule], {
        env: pythonEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const handleEvent = async (event: HandlerEvent) => {
        try {
          if (event.type === 'progress') {
            const progress =
              typeof event.progress === 'number' && Number.isFinite(event.progress)
                ? Math.max(0, Math.min(100, Math.round(event.progress)))
                : undefined;
            const message = event.message?.trim();
            if (progress === undefined && !message) return;
            await this.updateRun(runId, {
              ...(progress !== undefined ? { progress } : {}),
              ...(message ? { statusMessage: message } : {}),
            });
            return;
          }

          if (event.type === 'log' && event.message) {
            await this.updateRun(runId, { statusMessage: event.message.trim() });
            return;
          }

          if (event.type === 'result') {
            result = event.result ?? {};
          }

          if (event.type === 'error' && event.message) {
            await this.updateRun(runId, { statusMessage: event.message.trim() });
          }
        } catch (error) {
          console.warn('Local worker failed to report progress', error);
        }
      };

      let stdoutBuffer = '';
      proc.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk.toString();
        let idx = stdoutBuffer.indexOf('\n');
        while (idx !== -1) {
          const line = stdoutBuffer.slice(0, idx).trim();
          stdoutBuffer = stdoutBuffer.slice(idx + 1);
          if (line) {
            try {
              const event = JSON.parse(line) as HandlerEvent;
              void handleEvent(event);
            } catch {
              void this.updateRun(runId, { statusMessage: line.slice(0, 180) });
            }
          }
          idx = stdoutBuffer.indexOf('\n');
        }
      });

      let stderrBuffer = '';
      proc.stderr.on('data', (chunk) => {
        stderrBuffer += chunk.toString();
      });

      proc.on('error', (error) => {
        reject(error);
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(result);
          return;
        }
        const message = stderrBuffer.trim() || `Python handler exited with code ${code}`;
        reject(new Error(message));
      });

      proc.stdin.write(JSON.stringify(payload));
      proc.stdin.end();
    });
  }
}

export const localComputationWorker = new LocalComputationWorker();
