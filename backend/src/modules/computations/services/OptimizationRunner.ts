import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../../config/config';

const DEFAULT_OPTIMIZATION_MODULE = 'aws_jobs.optimization_handler';

export type OptimizationInput = {
  weights: {
    accuracy: number;
    f1: number;
    rocAuc: number;
    ntps: number;
  };
  conveyors: Array<{
    run_id: string;
    path_node_ids: string[];
    payload?: Record<string, unknown> | null;
    payload_json?: string | null;
  }>;
};

export type OptimizationResult = {
  best: {
    run_id: string;
    path_node_ids: string[];
    score: number;
  };
  scores?: Array<{
    run_id: string;
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

export class OptimizationRunner {
  async run(payload: OptimizationInput): Promise<OptimizationResult> {
    const pythonBin = config.computations.pythonBin || 'python3';
    const handlerModule =
      config.computations.optimizationModule ||
      process.env.OPTIMIZATION_HANDLER_MODULE ||
      DEFAULT_OPTIMIZATION_MODULE;
    const pythonPath = this.resolvePythonPath();
    const envPythonPath = process.env.PYTHONPATH ?? '';
    const pythonEnv = {
      ...process.env,
      PYTHONPATH: [pythonPath, envPythonPath].filter(Boolean).join(path.delimiter),
    };

    return new Promise((resolve, reject) => {
      let result: OptimizationResult | null = null;
      let errorMessage = '';
      let stdoutBuffer = '';
      let stderrBuffer = '';

      const proc = spawn(pythonBin, ['-m', handlerModule], {
        env: pythonEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      proc.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk.toString();
        let idx = stdoutBuffer.indexOf('\n');
        while (idx !== -1) {
          const line = stdoutBuffer.slice(0, idx).trim();
          stdoutBuffer = stdoutBuffer.slice(idx + 1);
          if (line) {
            try {
              const event = JSON.parse(line) as {
                type?: string;
                result?: OptimizationResult;
                message?: string;
              };
              if (event.type === 'result' && event.result) {
                result = event.result;
              }
              if (event.type === 'error' && event.message) {
                errorMessage = event.message;
              }
            } catch {
            }
          }
          idx = stdoutBuffer.indexOf('\n');
        }
      });

      proc.stderr.on('data', (chunk) => {
        stderrBuffer += chunk.toString();
      });

      proc.on('error', (error) => {
        reject(error);
      });

      proc.on('close', (code) => {
        if (code === 0 && result) {
          resolve(result);
          return;
        }
        const message =
          errorMessage ||
          stderrBuffer.trim() ||
          (code === 0 ? 'Optimization result is missing' : `Optimizer exited with code ${code}`);
        reject(new Error(message));
      });

      proc.stdin.write(JSON.stringify(payload));
      proc.stdin.end();
    });
  }

  private resolvePythonPath() {
    const candidates = [
      process.cwd(),
      path.resolve(process.cwd(), '..'),
      path.resolve(process.cwd(), '..', '..'),
    ];

    for (const candidate of candidates) {
      const handlerPath = path.join(
        candidate,
        'aws-jobs',
        'src',
        'aws_jobs',
        'optimization_handler.py'
      );
      if (fs.existsSync(handlerPath)) {
        return path.join(candidate, 'aws-jobs', 'src');
      }
    }

    return path.join(process.cwd(), 'aws-jobs', 'src');
  }
}
