import { readdir } from 'node:fs/promises';
import path from 'node:path';

import {
  parseNodeCoverageSummary,
  readCommandOutputFile,
  runCommandWithTee,
  upsertTestMetricsRow,
} from '../../scripts/test-metrics.mjs';

const distDir = path.resolve(process.cwd(), '.test-dist/tests');

const walk = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return walk(fullPath);
      }
      return fullPath.endsWith('.test.js') ? [fullPath] : [];
    })
  );
  return files.flat();
};

const testFiles = (await walk(distDir)).sort((left, right) => left.localeCompare(right));

if (testFiles.length === 0) {
  throw new Error(`No compiled test files found in ${distDir}`);
}

const coverageArgs = [
  '--experimental-test-coverage',
  '--test-coverage-include=.test-dist/src/**/*.js',
  '--test-coverage-exclude=.test-dist/tests/**/*.js',
  '--test-coverage-exclude=.test-dist/src/graphql/**/*.js',
  '--test',
  ...testFiles,
];

const outputFile = path.join('/tmp', `desktop-test-output-${process.pid}.log`);

const coverageResult = await runCommandWithTee(process.execPath, coverageArgs, {
  cwd: process.cwd(),
  env: process.env,
  outputFile,
});

const summary = parseNodeCoverageSummary(await readCommandOutputFile(outputFile));

if (summary) {
  await upsertTestMetricsRow({
    component: 'desktop',
    testCount: summary.testCount,
    coverage: summary.coverage,
  });
} else if (coverageResult.code === 0) {
  throw new Error('Could not parse desktop test summary');
}

if (typeof coverageResult.code === 'number' && coverageResult.code !== 0) {
  process.exit(coverageResult.code);
}

if (coverageResult.signal) {
  process.kill(process.pid, coverageResult.signal);
}
