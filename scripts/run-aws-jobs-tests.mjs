import { execFileSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  parsePythonTraceSummary,
  projectRoot,
  readCommandOutputFile,
  runCommandWithTee,
  upsertTestMetricsRow,
} from './test-metrics.mjs';

const pythonEnvironment = JSON.parse(
  execFileSync(
    'python3',
    [
      '-c',
      'import json, sys, sysconfig; print(json.dumps({"executable": sys.executable, "libraryDirs": [sysconfig.get_path(name) for name in ("stdlib", "platstdlib", "purelib", "platlib")]}))',
    ],
    { encoding: 'utf8' }
  )
);
const ignoreDir = [
  ...pythonEnvironment.libraryDirs,
  tmpdir(),
  path.join(projectRoot, 'node_modules'),
].join(path.delimiter);

const runSuite = async ({ component, traceDir, pattern }) => {
  await rm(traceDir, { recursive: true, force: true });
  const outputFile = path.join(
    '/tmp',
    `${component.replace(/[:]/g, '-')}-test-output-${process.pid}.log`
  );

  const result = await runCommandWithTee(
    pythonEnvironment.executable,
    [
      '-m',
      'trace',
      '--count',
      '--summary',
      '--module',
      '-C',
      traceDir,
      `--ignore-dir=${ignoreDir}`,
      'unittest',
      'discover',
      '-s',
      'aws-jobs/tests',
      '-p',
      pattern,
    ],
    {
      cwd: projectRoot,
      env: process.env,
      outputFile,
    }
  );

  const output = await readCommandOutputFile(outputFile);
  const summary = parsePythonTraceSummary(output);

  if (summary) {
    await upsertTestMetricsRow({
      component,
      testCount: summary.testCount,
      coverage: summary.coverage,
    });
  } else if (result.code === 0) {
    throw new Error(`Could not parse Python test summary for ${component}`);
  }

  if (typeof result.code === 'number' && result.code !== 0) {
    process.exit(result.code);
  }

  if (result.signal) {
    process.kill(process.pid, result.signal);
  }

  return {
    output,
    testCount: summary ? summary.testCount : 0,
  };
};

const computeSuite = await runSuite({
  component: 'aws-jobs:compute',
  traceDir: path.join('/tmp', 'aws-jobs-trace-compute'),
  pattern: 'test_compute*.py',
});

const optimizationSuite = await runSuite({
  component: 'aws-jobs:optimization',
  traceDir: path.join('/tmp', 'aws-jobs-trace-optimization'),
  pattern: 'test_optimization*.py',
});
