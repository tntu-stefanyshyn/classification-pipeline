import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

export const projectRoot = path.resolve(scriptDir, '..');
export const testMetricsCsvPath = path.join(projectRoot, 'test-metrics.csv');

const headerColumns = [
  'частини програмної системи',
  'кількість тестів',
  'покриття тестами коду',
];

const escapeCsvCell = (value) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const parseCsvLine = (line) => {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (character === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  cells.push(current);
  return cells;
};

const renderCsvRow = (values) => values.map(escapeCsvCell).join(',');

const escapeShellArgument = (value) => `'${String(value).replace(/'/g, `'\"'\"'`)}'`;

export const runCommandWithTee = async (command, args, options = {}) => {
  if (!options.outputFile) {
    throw new Error('runCommandWithTee requires an outputFile option');
  }

  await writeFile(options.outputFile, '', 'utf8');

  const shellCommand = `set -o pipefail; ${[command, ...args]
    .map(escapeShellArgument)
    .join(' ')} 2>&1 | tee ${escapeShellArgument(options.outputFile)}`;

  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['-lc', shellCommand], {
      cwd: options.cwd,
      env: options.env,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('close', (code, signal) => {
      resolve({
        code,
        signal,
      });
    });
  });
};

export const readCommandOutputFile = async (outputFile) => {
  try {
    return await readFile(outputFile, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return '';
    }
    throw error;
  }
};

export const parseNodeCoverageSummary = (output) => {
  const testsMatch = output.match(/^# tests (\d+)/m);
  const coverageMatch = output.match(/^# all files\s+\|\s+([0-9]+(?:\.[0-9]+)?)\s+\|/m);

  if (!testsMatch || !coverageMatch) {
    return null;
  }

  return {
    testCount: Number(testsMatch[1]),
    coverage: Number(coverageMatch[1]),
  };
};

export const parsePythonTraceSummary = (output) => {
  const testsMatch = output.match(/^Ran (\d+) tests? in /m);
  const coverageRows = [...output.matchAll(/^\s*(\d+)\s+([0-9]+(?:\.[0-9]+)?)%\s+\S+\s+\(.+\)$/gm)];

  if (!testsMatch || coverageRows.length === 0) {
    return null;
  }

  let totalLines = 0;
  let coveredLines = 0;

  for (const [, linesText, coverageText] of coverageRows) {
    const lineCount = Number(linesText);
    const coverage = Number(coverageText);
    totalLines += lineCount;
    coveredLines += (lineCount * coverage) / 100;
  }

  return {
    testCount: Number(testsMatch[1]),
    coverage: totalLines === 0 ? 0 : (coveredLines / totalLines) * 100,
  };
};

export const upsertTestMetricsRow = async ({ component, testCount, coverage }) => {
  let existingContent = '';

  try {
    existingContent = await readFile(testMetricsCsvPath, 'utf8');
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      throw error;
    }
  }

  const rows = existingContent
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(1)
    .map((line) => {
      const [existingComponent = '', existingTestCount = '', existingCoverage = ''] = parseCsvLine(line);
      return {
        component: existingComponent,
        testCount: existingTestCount,
        coverage: existingCoverage,
      };
    });

  const nextRow = {
    component,
    testCount: String(testCount),
    coverage: `${coverage.toFixed(2)}%`,
  };

  const rowIndex = rows.findIndex((row) => row.component === component);

  if (rowIndex >= 0) {
    rows[rowIndex] = nextRow;
  } else {
    rows.push(nextRow);
  }

  const csvContent = [
    renderCsvRow(headerColumns),
    ...rows.map((row) => renderCsvRow([row.component, row.testCount, row.coverage])),
  ].join('\n');

  await writeFile(testMetricsCsvPath, `${csvContent}\n`, 'utf8');
};
