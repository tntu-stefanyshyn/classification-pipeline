import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { loadFreshModule, setEnv, stub } from './testUtils';

type SpawnCall = {
  command: string;
  args: string[];
  options: Record<string, unknown>;
  stdinBuffer: string;
};

const pythonRunnerModulePath = path.resolve(
  __dirname,
  '../src/workers/localComputation/pythonRunner'
);

const createProcess = () => {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { write: (chunk: string | Buffer) => void; end: () => void };
    killed?: boolean;
    kill: (signal?: NodeJS.Signals) => void;
    stdinBuffer?: string;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdinBuffer = '';
  proc.stdin = {
    write: (chunk) => {
      proc.stdinBuffer += chunk.toString();
    },
    end: () => undefined,
  };
  proc.kill = (_signal?: NodeJS.Signals) => {
    proc.killed = true;
  };
  return proc;
};

test('warmupLocalDockerImage builds the docker image when it is missing', async (t) => {
  setEnv(t, 'LOCAL_WORKER_REBUILD_IMAGE', '0');
  setEnv(t, 'NODE_ENV', 'production');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-aws-jobs-'));
  fs.writeFileSync(path.join(tempDir, 'Dockerfile'), 'FROM scratch\n');
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  setEnv(t, 'AWS_JOBS_DIR', tempDir);

  const childProcess = require('node:child_process') as typeof import('node:child_process');
  const spawnCalls: SpawnCall[] = [];
  stub(t, childProcess as any, 'spawn', ((
    command: string,
    args: string[],
    options: Record<string, unknown>
  ) => {
    const proc = createProcess();
    spawnCalls.push({ command, args, options, stdinBuffer: proc.stdinBuffer ?? '' });
    queueMicrotask(() => proc.emit('close', args[0] === 'image' ? 1 : 0));
    return proc as any;
  }) as any);

  const logs: string[] = [];
  const module =
    loadFreshModule<typeof import('../src/workers/localComputation/pythonRunner')>(
      pythonRunnerModulePath
    );

  await module.warmupLocalDockerImage({
    onLog: async (message) => {
      logs.push(message);
    },
  });

  assert.deepEqual(
    spawnCalls.map((call) => [call.command, call.args]),
    [
      ['docker', ['image', 'inspect', 'aws-jobs']],
      ['docker', ['build', '-t', 'aws-jobs', tempDir]],
    ]
  );
  assert.match(logs[0] ?? '', /Image "aws-jobs" not found/);
});

test('runPythonHandler starts docker with compute payload and writes handler input to stdin', async (t) => {
  setEnv(t, 'LOCAL_WORKER_REBUILD_IMAGE', '0');
  setEnv(t, 'NODE_ENV', 'production');

  const childProcess = require('node:child_process') as typeof import('node:child_process');
  const spawnCalls: SpawnCall[] = [];
  stub(t, childProcess as any, 'spawn', ((
    command: string,
    args: string[],
    options: Record<string, unknown>
  ) => {
    const proc = createProcess();
    const call: SpawnCall = { command, args, options, stdinBuffer: '' };
    spawnCalls.push(call);
    const syncStdin = () => {
      call.stdinBuffer = proc.stdinBuffer ?? '';
    };
    const originalWrite = proc.stdin.write;
    proc.stdin.write = (chunk) => {
      originalWrite(chunk);
      syncStdin();
    };
    proc.stdin.end = () => {
      syncStdin();
      queueMicrotask(() => {
        if (args[0] === 'run') {
          proc.stdout.emit('data', Buffer.from('handler started\n'));
        }
        proc.emit('close', 0);
      });
    };
    if (args[0] === 'image') {
      queueMicrotask(() => proc.emit('close', 0));
    }
    return proc as any;
  }) as any);

  const logs: string[] = [];
  const module =
    loadFreshModule<typeof import('../src/workers/localComputation/pythonRunner')>(
      pythonRunnerModulePath
    );
  const payload = {
    pipelineId: 'run-1',
    experiment_id: 'exp-1',
    queue: 'local',
    backend_url: 'http://backend/graphql',
    file_id: 'file-1',
    path: [],
  } as any;

  const result = await module.runPythonHandler(
    payload,
    {},
    {
      onLog: async (message) => {
        logs.push(message);
      },
    }
  );

  assert.equal(result, null);
  assert.deepEqual(spawnCalls[0]?.args, ['image', 'inspect', 'aws-jobs']);
  assert.deepEqual(spawnCalls[1]?.args, [
    'run',
    '--rm',
    '-i',
    '--env',
    'COMPUTE_PAYLOAD_JSON={"pipelineId":"run-1"}',
    '--env',
    'COMPUTE_BACKEND_URL=http://backend/graphql',
    '--add-host',
    'host.docker.internal:host-gateway',
    'aws-jobs',
  ]);
  assert.equal(spawnCalls[1]?.stdinBuffer, JSON.stringify(payload));
  assert.equal(logs.includes('handler started'), true);
});
