import { spawn } from 'node:child_process';
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
const DOCKER_IMAGE = 'aws-jobs-local';

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

export const runPythonHandler = async (
  payload: HandlerPayload,
  options: PythonHandlerOptions,
  callbacks: PythonHandlerCallbacks
): Promise<Record<string, unknown> | null> => {
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

    runArgs.push('--add-host', 'host.docker.internal:host-gateway', DOCKER_IMAGE);

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
