import { spawn } from 'node:child_process';
import { config } from '../../../config/config';
import { ExperimentModel } from '../../experiments/models/ExperimentModel';
import { PipelineModel } from '../../../core/pipeline';
import { ObjectIdOrString } from '../../../types/context';

const DEFAULT_OPTIMIZATION_IMAGE = 'aws-jobs-optimization';

export type OptimizationInput = {
  experimentId: ObjectIdOrString;
  backendUrl?: string;
  backendToken?: string;
  hyperOptimizationMinutesPerPipeline?: number;
  timeoutSeconds?: number;
};

export type OptimizationResult = {
  best: {
    pipelineId: string;
    path_node_ids: string[];
    score: number;
  };
  scores?: Array<{
    pipelineId: string;
    path_node_ids: string[];
    score: number;
    normalized?: {
      accuracy?: number;
      f1?: number;
      rocAuc?: number;
      ntps?: number;
    };
  }>;
};

export type OptimizationEvent = {
  type?: 'progress' | 'result' | 'error';
  progress?: number;
  message?: string;
  pipelineId?: string;
  score?: number;
  result?: OptimizationResult;
};

export type OptimizationRunnerOptions = {
  onEvent?: (event: OptimizationEvent) => void;
};

export class OptimizationRunner {
  async run(payload: OptimizationInput): Promise<void> {
    const { backendUrl, backendToken } = this.resolveBackendConfig(payload);
    const dockerImage = process.env.OPTIMIZATION_DOCKER_IMAGE || DEFAULT_OPTIMIZATION_IMAGE;
    const containerPayload = {
      experimentId: payload.experimentId,
      backend_url: backendUrl,
      backend_token: backendToken,
      hyper_optimization_minutes_per_pipeline: payload.hyperOptimizationMinutesPerPipeline ?? 30,
    };
    const payloadJson = JSON.stringify(containerPayload);

    return new Promise((resolve, reject) => {
      const args = [
        'run',
        '--rm',
        '-i',
        '--add-host',
        'host.docker.internal:host-gateway',
        dockerImage,
        'python',
        '-u',
        'src/aws_jobs/optimization_handler/optimization_handler.py',
        '--env',
        `OPTIMIZATION_PAYLOAD_JSON=${payloadJson}`,
      ];

      const proc = spawn('docker', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const timeoutSeconds = Math.max(0, Math.trunc(payload.timeoutSeconds ?? 0));
      const timeoutId =
        timeoutSeconds > 0
          ? setTimeout(() => {
              proc.kill('SIGTERM');
              reject(new Error(`Оптимізація перевищила ліміт часу (${timeoutSeconds} с).`));
            }, timeoutSeconds * 1000)
          : null;
      proc.on('error', (error) => {
        if (timeoutId) clearTimeout(timeoutId);
        console.error('Помилка запуску процесу оптимізації', error);
        reject(error);
      });

      proc.on('close', () => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve();
      });

      proc.stdin.write(JSON.stringify(containerPayload));
      proc.stdin.end();
    });
  }

  private resolveBackendConfig(payload: OptimizationInput) {
    const backendUrl =
      payload.backendUrl?.trim() ||
      config.backend.graphqlUrl?.trim() ||
      `http://host.docker.internal:${config.port}/graphql`;
    const backendToken = payload.backendToken?.trim() || config.backend.serviceToken?.trim() || '';

    if (!backendUrl) {
      throw new Error('Backend URL is missing for optimization');
    }

    return { backendUrl, backendToken };
  }

  private async lookupResult(experimentId: ObjectIdOrString): Promise<OptimizationResult> {
    const experiment = await ExperimentModel.findById(experimentId).lean();
    const bestPipelineId = experiment?.optimization?.bestPipelineId;
    const bestScore = experiment?.optimization?.bestScore;

    if (!bestPipelineId || typeof bestScore !== 'number') {
      throw new Error('Optimization result is missing');
    }

    const pipeline = await PipelineModel.findById(bestPipelineId).lean();
    if (!pipeline) {
      throw new Error('Best pipeline not found for optimization result');
    }
    const pathNodeIds = (pipeline.pathNodeIds ?? []).map((id: any) => String(id));

    return {
      best: {
        pipelineId: String(bestPipelineId),
        path_node_ids: pathNodeIds,
        score: bestScore,
      },
    };
  }
}
