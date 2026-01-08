import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { HandlerPayload } from './types';

export type PythonHandlerOptions = {
  pythonBin?: string;
  handlerModule?: string;
  signal?: AbortSignal;
};

export type PythonHandlerCallbacks = {
  onProgress?: (progress?: number, message?: string) => Promise<void>;
  onLog?: (message: string) => Promise<void>;
  onError?: (message: string) => Promise<void>;
};

const DOCKER_BUILD_PREFIX = '[docker build] ';

const attachStreamLogger = (
  stream: NodeJS.ReadableStream | null,
  callbacks: PythonHandlerCallbacks,
  prefix: string
) => {
  if (!stream) return;
  let buffer = '';
  stream.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    let idx = buffer.indexOf('\n');
    while (idx !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) {
        void callbacks.onLog?.(`${prefix}${line}`);
      }
      idx = buffer.indexOf('\n');
    }
  });
  stream.on('end', () => {
    const leftover = buffer.trim();
    if (leftover) {
      void callbacks.onLog?.(`${prefix}${leftover}`);
    }
  });
};

const buildDockerImage = (image: string, signal?: AbortSignal): Promise<void> => {
  const contextDir = path.join(__dirname, '../../../aws-jobs');
  const dockerfilePath = path.join(contextDir, 'Dockerfile');
  if (!fs.existsSync(dockerfilePath)) {
    throw new Error(`Dockerfile not found at ${dockerfilePath}`);
  }

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const error = new Error('Local computation aborted');
      error.name = 'AbortError';
      reject(error);
      return;
    }

    const buildArgs = ['build', '-t', image, '-f', dockerfilePath, contextDir];
    const buildProc = spawn('docker', buildArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let settled = false;

    const cleanup = () => {
      signal?.removeEventListener('abort', handleAbort);
    };

    const handleAbort = () => {
      if (settled) return;
      settled = true;
      if (!buildProc.killed) {
        buildProc.kill('SIGTERM');
      }
      const error = new Error('Local computation aborted');
      error.name = 'AbortError';
      cleanup();
      reject(error);
    };

    signal?.addEventListener('abort', handleAbort);

    buildProc.on('error', (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });

    buildProc.on('close', (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Docker build exited with code ${code}`));
    });
  });
};

const isAbortError = (error: unknown): error is Error =>
  error instanceof Error && error.name === 'AbortError';

export const runPythonHandler = async (
  payload: HandlerPayload,
  options: PythonHandlerOptions,
  callbacks: PythonHandlerCallbacks
): Promise<Record<string, unknown> | null> => {
  const image = 'python-pipeline' + payload.pipelineId;

  try {
    await buildDockerImage(image, options.signal);
  } catch (error) {
    if (isAbortError(error) || options.signal?.aborted) {
      return null;
    }
    throw error;
  }

  if (options.signal?.aborted) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const result: Record<string, unknown> | null = null;
    let aborted = false;
    let abortTimer: NodeJS.Timeout | null = null;
    const runArgs: string[] = ['run', '--rm', '-i'];
    const computePayloadJson = JSON.stringify({ pipelineId: payload.pipelineId });

    runArgs.push('--env', `COMPUTE_PAYLOAD_JSON=${computePayloadJson}`);

    runArgs.push('--env', `COMPUTE_BACKEND_URL=${payload.backend_url}`);

    runArgs.push('--add-host', 'host.docker.internal:host-gateway', image);

    const proc = spawn('docker', runArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    attachStreamLogger(proc.stdout, callbacks, DOCKER_BUILD_PREFIX);
    attachStreamLogger(proc.stderr, callbacks, DOCKER_BUILD_PREFIX);

    let stderrBuffer = '';
    proc.stderr.on('data', (chunk) => {
      stderrBuffer += chunk.toString();
    });

    proc.on('error', (error) => {
      if (abortTimer) {
        clearTimeout(abortTimer);
        abortTimer = null;
      }
      if (options.signal) {
        options.signal.removeEventListener('abort', handleAbort);
      }
      reject(error);
    });

    proc.on('close', (code) => {
      if (abortTimer) {
        clearTimeout(abortTimer);
        abortTimer = null;
      }
      if (options.signal) {
        options.signal.removeEventListener('abort', handleAbort);
      }
      if (aborted) {
        resolve(null);
        return;
      }
      if (code === 0) {
        resolve(result);
        return;
      }
      const message = stderrBuffer.trim() || `Python handler exited with code ${code}`;
      reject(new Error(message));
    });

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
      }, 2000);
    };

    if (options.signal) {
      if (options.signal.aborted) {
        handleAbort();
      } else {
        options.signal.addEventListener('abort', handleAbort);
      }
    }

    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
  });
};
