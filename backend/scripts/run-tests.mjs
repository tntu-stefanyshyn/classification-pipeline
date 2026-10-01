import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  computeFullNodeCoverage,
  parseNodeCoverageSummary,
  readCommandOutputFile,
  runCommandWithTee,
  upsertTestMetricsRow,
  walkFilesRecursive,
} from '../../scripts/test-metrics.mjs';

const distDir = path.resolve(process.cwd(), 'dist');
const childEnvName = 'BACKEND_TEST_METRICS_CHILD';

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

const runCompiledTests = async () => {
  const testFiles = (await walk(distDir)).sort((left, right) => left.localeCompare(right));

  if (testFiles.length === 0) {
    throw new Error(`No compiled test files found in ${distDir}`);
  }

  for (const testFile of testFiles) {
    await import(pathToFileURL(testFile).href);
  }
};

if (process.env[childEnvName] === '1') {
  await runCompiledTests();
} else {
  const outputFile = path.join('/tmp', `backend-test-output-${process.pid}.log`);

  const coverageResult = await runCommandWithTee(
    process.execPath,
    [
      '--experimental-test-coverage',
      '--test-coverage-exclude=dist/**/*.test.js',
      '--test-coverage-exclude=dist/test/**',
      '--test-coverage-exclude=scripts/**',
      '--test-coverage-exclude=../scripts/**',
      path.resolve(process.cwd(), 'scripts/run-tests.mjs'),
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        [childEnvName]: '1',
      },
      outputFile,
    }
  );

  const output = await readCommandOutputFile(outputFile);
  const summary = parseNodeCoverageSummary(output);
  const sourceFiles = (await walkFilesRecursive(path.resolve(process.cwd(), 'src')))
    .filter((filePath) => filePath.endsWith('.ts'))
    .filter((filePath) => !filePath.endsWith('.d.ts'))
    .filter((filePath) => !filePath.endsWith('.test.ts'))
    .filter((filePath) => !filePath.includes(`${path.sep}test${path.sep}`));
  const compiledFiles = sourceFiles.map((filePath) =>
    path.join(
      process.cwd(),
      'dist',
      path.relative(path.join(process.cwd(), 'src'), filePath).replace(/\.ts$/, '.js')
    )
  );
  const fullCoverage = await computeFullNodeCoverage({
    filePaths: compiledFiles,
    output,
    cwd: process.cwd(),
  });

  console.log(
    `# full backend coverage: ${fullCoverage.coverage.toFixed(2)}% (${fullCoverage.coveredFileCount}/${fullCoverage.fileCount} files in scope)`
  );

  if (summary) {
    await upsertTestMetricsRow({
      component: 'backend',
      testCount: summary.testCount,
      coverage: fullCoverage.coverage,
    });
  } else if (coverageResult.code === 0) {
    throw new Error('Could not parse backend test summary');
  }

  if (typeof coverageResult.code === 'number' && coverageResult.code !== 0) {
    process.exit(coverageResult.code);
  }

  if (coverageResult.signal) {
    process.kill(process.pid, coverageResult.signal);
  }
}
