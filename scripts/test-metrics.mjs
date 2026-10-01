import { readdir, readFile, writeFile } from 'node:fs/promises';
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

export const parseNodeCoverageFilePercents = (output) => {
  const coverageByFile = new Map();
  const tree = [];
  const lines = output.split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^#(?<indent>\s+)(?<name>[^|]+?)\s+\|\s*(?<linePercent>[0-9]+(?:\.[0-9]+)?)?\s*\|/);
    if (!match || !match.groups) {
      continue;
    }

    const indent = match.groups.indent.length;
    const name = match.groups.name.trim();
    const linePercent = match.groups.linePercent ? Number(match.groups.linePercent) : null;

    while (tree.length > 0 && tree[tree.length - 1].indent >= indent) {
      tree.pop();
    }

    if (linePercent === null) {
      tree.push({ indent, name });
      continue;
    }

    const pathParts = [...tree.map((entry) => entry.name), name];
    coverageByFile.set(pathParts.join('/'), linePercent);
  }

  return coverageByFile;
};

export const walkFilesRecursive = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return walkFilesRecursive(fullPath);
      }
      return [fullPath];
    })
  );

  return files.flat();
};

export const countRelevantLines = (content) =>
  content
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed !== '' && trimmed !== '/*' && trimmed !== '*/' && !trimmed.startsWith('//') && trimmed !== '*';
    }).length;

export const computeFullNodeCoverage = async ({ filePaths, output, cwd }) => {
  const coverageByFile = parseNodeCoverageFilePercents(output);
  const files = [...filePaths].sort((left, right) => left.localeCompare(right));

  let totalRelevantLines = 0;
  let coveredRelevantLines = 0;
  let coveredFileCount = 0;

  for (const filePath of files) {
    const relativeToDist = path.relative(cwd, filePath).split(path.sep).join('/');
    const content = await readFile(filePath, 'utf8');
    const relevantLines = countRelevantLines(content);

    totalRelevantLines += relevantLines;

    const linePercent = coverageByFile.get(relativeToDist) ?? 0;
    if (linePercent > 0) {
      coveredFileCount += 1;
    }
    coveredRelevantLines += (relevantLines * linePercent) / 100;
  }

  return {
    fileCount: files.length,
    coveredFileCount,
    coverage: totalRelevantLines === 0 ? 0 : (coveredRelevantLines / totalRelevantLines) * 100,
  };
};

export const computeFullDesktopCoverage = async ({ distSrcDir, output, cwd }) => {
  const files = (await walkFilesRecursive(distSrcDir))
    .filter((filePath) => filePath.endsWith('.js'))
    .filter((filePath) => !filePath.endsWith('.d.js'));

  return computeFullNodeCoverage({
    filePaths: files,
    output,
    cwd,
  });
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
