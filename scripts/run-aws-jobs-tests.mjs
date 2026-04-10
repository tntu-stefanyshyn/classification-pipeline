import { rm } from 'node:fs/promises';
import path from 'node:path';

import {
  parsePythonTraceSummary,
  projectRoot,
  readCommandOutputFile,
  runCommandWithTee,
  upsertTestMetricsRow,
} from './test-metrics.mjs';

const ignoreDir = '/usr/lib/python3.12:/usr/lib/python3/dist-packages:/tmp:./node_modules';

const runSuite = async ({ component, traceDir, pattern }) => {
  await rm(traceDir, { recursive: true, force: true });
  const outputFile = path.join('/tmp', `${component.replace(/[:]/g, '-')}-test-output-${process.pid}.log`);

  const result = await runCommandWithTee(
    'python3',
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

  const summary = parsePythonTraceSummary(await readCommandOutputFile(outputFile));

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
};

await runSuite({
  component: 'aws-jobs:compute',
  traceDir: path.join('/tmp', 'aws-jobs-trace-compute'),
  pattern: 'test_compute*.py',
});

await runSuite({
  component: 'aws-jobs:optimization',
  traceDir: path.join('/tmp', 'aws-jobs-trace-optimization'),
  pattern: 'test_optimization*.py',
});
