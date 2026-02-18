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
const DOCKER_RUN_PREFIX = '[docker run] ';
const DOCKER_IMAGE = 'aws-jobs';
const rebuildFlag = (process.env.LOCAL_WORKER_REBUILD_IMAGE ?? '').trim().toLowerCase();
const shouldRebuildImage =
  rebuildFlag === '1' ||
  rebuildFlag === 'true' ||
  (rebuildFlag !== '0' && rebuildFlag !== 'false' && process.env.NODE_ENV === 'development');
let imageReadyPromise: Promise<void> | null = null;

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

const runDockerCommand = (
  args: string[],
  callbacks: PythonHandlerCallbacks,
  logPrefix: string,
  cwd?: string
) =>
  new Promise<void>((resolve, reject) => {
    const proc = spawn('docker', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    attachStreamLogger(proc.stdout, callbacks, logPrefix);
    attachStreamLogger(proc.stderr, callbacks, logPrefix);

    let stderrBuffer = '';
    proc.stderr.on('data', (chunk) => {
      stderrBuffer += chunk.toString();
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

const dockerImageExists = () =>
  new Promise<boolean>((resolve, reject) => {
    const proc = spawn('docker', ['image', 'inspect', DOCKER_IMAGE], {
      stdio: 'ignore',
    });
    proc.on('error', reject);
    proc.on('close', (code) => resolve(code === 0));
  });

const resolveAwsJobsDir = () => {
  const configuredDir = process.env.AWS_JOBS_DIR?.trim();
  const candidates = [
    configuredDir,
    path.resolve(process.cwd(), '../aws-jobs'),
    path.resolve(process.cwd(), 'aws-jobs'),
    path.resolve(__dirname, '../../../../aws-jobs'),
    path.resolve(__dirname, '../../../../../aws-jobs'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'Dockerfile'))) ?? null;
};

const ensureDockerImageReady = async (callbacks: PythonHandlerCallbacks) => {
  if (imageReadyPromise) return imageReadyPromise;

  imageReadyPromise = (async () => {
    const imageExists = await dockerImageExists();

    const awsJobsDir = resolveAwsJobsDir();
    if ((!imageExists || shouldRebuildImage) && !awsJobsDir) {
      throw new Error(
        `Docker image "${DOCKER_IMAGE}" is missing and aws-jobs directory was not found.`
      );
    }

    if (!imageExists) {
      await callbacks.onLog?.(
        `${DOCKER_BUILD_PREFIX}Image "${DOCKER_IMAGE}" not found. Building from ${awsJobsDir}...`
      );
      await runDockerCommand(
        ['build', '-t', DOCKER_IMAGE, awsJobsDir as string],
        callbacks,
        DOCKER_BUILD_PREFIX
      );
      return;
    }

    if (shouldRebuildImage) {
      await callbacks.onLog?.(
        `${DOCKER_BUILD_PREFIX}Rebuilding image "${DOCKER_IMAGE}" from ${awsJobsDir}...`
      );
      await runDockerCommand(
        ['build', '-t', DOCKER_IMAGE, awsJobsDir as string],
        callbacks,
        DOCKER_BUILD_PREFIX
      );
    }
  })().catch((error) => {
    imageReadyPromise = null;
    throw error;
  });

  return imageReadyPromise;
};

export const warmupLocalDockerImage = async (callbacks: PythonHandlerCallbacks = {}) => {
  await ensureDockerImageReady(callbacks);
};

export const runPythonHandler = async (
  payload: HandlerPayload,
  options: PythonHandlerOptions,
  callbacks: PythonHandlerCallbacks
): Promise<Record<string, unknown> | null> => {
  await ensureDockerImageReady(callbacks);

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

    attachStreamLogger(proc.stdout, callbacks, DOCKER_RUN_PREFIX);
    attachStreamLogger(proc.stderr, callbacks, DOCKER_RUN_PREFIX);

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
