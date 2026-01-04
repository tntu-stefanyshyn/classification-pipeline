import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { HandlerEvent, HandlerPayload } from './types';

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

export const runPythonHandler = (
  payload: HandlerPayload,
  options: PythonHandlerOptions,
  callbacks: PythonHandlerCallbacks
): Promise<Record<string, unknown> | null> => {
  return new Promise((resolve, reject) => {
    let result: Record<string, unknown> | null = null;
    let aborted = false;
    let abortTimer: NodeJS.Timeout | null = null;
    const image = 'python-pipeline';

    const proc = spawn(
      'docker',
      [
        'run',
        '--rm',
        '-i',
        '-v',
        `${process.cwd()}:/app`,
        image,
        'python',
        '-m',
        'aws_jobs.compute_handler',
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    const handleEvent = async (event: HandlerEvent) => {
      try {
        if (event.type === 'progress') {
          await callbacks.onProgress?.(event.progress, event.message);
          return;
        }

        if (event.type === 'log' && event.message) {
          await callbacks.onLog?.(event.message.trim());
          return;
        }

        if (event.type === 'result') {
          result = event.result ?? {};
          return;
        }

        if (event.type === 'error' && event.message) {
          await callbacks.onError?.(event.message.trim());
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
            void callbacks.onLog?.(line.slice(0, 180));
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
