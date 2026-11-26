import type {
  CompareRun,
  CompareRow,
  MetricCompareRow,
  SettingsLabels,
} from '../CompareModal.types';

const NO_DATA = '—';

export const mean = (values?: number[] | null) =>
  values?.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

export const formatScore = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(4) : NO_DATA;

/**
 * Per fold, whether the two runs show a different score: compared as displayed, so values that
 * round to the same number are equal, and a fold only one run has differs.
 */
export const foldDiffers = (foldsA: number[], foldsB: number[]) =>
  Array.from(
    { length: Math.max(foldsA.length, foldsB.length) },
    (_, index) => formatScore(foldsA[index]) !== formatScore(foldsB[index])
  );
export const formatDelta = (delta: number | null) =>
  delta === null ? NO_DATA : `${delta > 0 ? '+' : ''}${delta.toFixed(4)}`;

export const matricesOf = (run: CompareRun) => {
  const result = run.computingResult;
  if (result?.confusionMatrixes?.length) return result.confusionMatrixes;
  return result?.confusionMatrix?.length ? [result.confusionMatrix] : [];
};

// Row-normalised, as in the single-run view, so folds with different sample counts compare fairly.
export const rowPercent = (cell: number, row: number[]) => {
  const total = row.reduce((sum, value) => sum + Number(value), 0);
  return total > 0 ? (Number(cell) / total) * 100 : 0;
};

const row = (label: string, a: string, b: string): CompareRow => ({
  label,
  a,
  b,
  differs: a !== b,
});

/** The settings of a node as `technology: key=value, ...`, so changed parameters show up. */
const describeNode = (node: CompareRun['pathNodes'][number] | undefined) => {
  if (!node) return NO_DATA;
  const settings = (node.settings ?? []).map(({ key, value }) => `${key}=${value}`).join(', ');
  return `${node.label || node.technology}${settings ? `: ${settings}` : ''}`;
};

export const buildSettingsRows = (
  a: CompareRun,
  b: CompareRun,
  labels: SettingsLabels,
  format: { queue: (run: CompareRun) => string; seconds: (run: CompareRun) => string }
): CompareRow[] => {
  const nodeCount = Math.max(a.pathNodes?.length ?? 0, b.pathNodes?.length ?? 0);
  const percent = (run: CompareRun) =>
    typeof run.computingResult?.predictionDataPercent === 'number'
      ? `${run.computingResult.predictionDataPercent}%`
      : NO_DATA;

  return [
    ...Array.from({ length: nodeCount }, (_, index) =>
      row(
        `${labels.node} ${index + 1}`,
        describeNode(a.pathNodes?.[index]),
        describeNode(b.pathNodes?.[index])
      )
    ),
    row(labels.queue, format.queue(a), format.queue(b)),
    row(labels.predictionSplit, percent(a), percent(b)),
    row(
      labels.folds,
      String(a.computingResult?.accuracyScores?.length ?? NO_DATA),
      String(b.computingResult?.accuracyScores?.length ?? NO_DATA)
    ),
    row(labels.duration, format.seconds(a), format.seconds(b)),
    row(
      labels.eegRows,
      String(a.computingResult?.sampleCount ?? NO_DATA),
      String(b.computingResult?.sampleCount ?? NO_DATA)
    ),
    row(
      labels.channels,
      a.computingResult?.channelNames?.join(', ') || NO_DATA,
      b.computingResult?.channelNames?.join(', ') || NO_DATA
    ),
    row(labels.device, a.machineInfo?.hostname || NO_DATA, b.machineInfo?.hostname || NO_DATA),
    row(
      labels.finished,
      new Date(a.updatedAt).toLocaleString(),
      new Date(b.updatedAt).toLocaleString()
    ),
  ];
};

const metric = (
  label: string,
  foldsA?: number[] | null,
  foldsB?: number[] | null
): MetricCompareRow => {
  const [meanA, meanB] = [mean(foldsA), mean(foldsB)];
  return {
    label,
    meanA,
    meanB,
    foldsA: foldsA ?? [],
    foldsB: foldsB ?? [],
    foldDiffers: foldDiffers(foldsA ?? [], foldsB ?? []),
    delta: meanA !== null && meanB !== null ? meanB - meanA : null,
    meanDiffers: formatScore(meanA) !== formatScore(meanB),
  };
};

export const buildMetricRows = (
  a: CompareRun,
  b: CompareRun,
  names: { accuracy: string; f1: string; rocAuc: string }
): MetricCompareRow[] => [
  metric(names.accuracy, a.computingResult?.accuracyScores, b.computingResult?.accuracyScores),
  metric(names.f1, a.computingResult?.f1Scores, b.computingResult?.f1Scores),
  metric(names.rocAuc, a.computingResult?.rocAucScores, b.computingResult?.rocAucScores),
];

/** The class that highlights a value which differs between the two runs. */
export const highlight = (differs: boolean) => (differs ? 'compare-diff' : undefined);

/**
 * Whether a confusion-matrix cell differs from the same cell of the other run, compared as the
 * shown row percentages; a cell the other run does not have differs.
 */
export const matrixCellDiffers = (
  matrix: number[][],
  other: number[][] | undefined,
  rowIndex: number,
  columnIndex: number
) => {
  const otherRow = other?.[rowIndex];
  if (!otherRow) return true;
  const mine = rowPercent(matrix[rowIndex][columnIndex], matrix[rowIndex]);
  return Math.abs(mine - rowPercent(otherRow[columnIndex], otherRow)) >= 0.01;
};
