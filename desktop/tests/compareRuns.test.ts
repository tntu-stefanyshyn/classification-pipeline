import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildMetricRows,
  foldDiffers,
  buildSettingsRows,
  rowPercent,
} from '../src/components/experiments/ComputationCard/components/CompareModal/utils/compare';

const labels = {
  node: 'Node',
  queue: 'Queue',
  duration: 'Duration',
  predictionSplit: 'Prediction share',
  folds: 'Folds',
  eegRows: 'Rows',
  channels: 'Channels',
  device: 'Device',
  finished: 'Finished',
};
const format = { queue: (run: any) => run.queue, seconds: () => '1.00 s' };

const makeRun = (overrides: { settings?: { key: string; value: string }[]; split?: number }) =>
  ({
    queue: 'local',
    updatedAt: '2026-01-01T10:00:00Z',
    machineInfo: { hostname: 'host' },
    pathNodes: [
      { _id: 'n1', label: 'Normalization', technology: 'Normalization', settings: [] },
      {
        _id: 'n2',
        label: 'SVM',
        technology: 'SVM',
        settings: overrides.settings ?? [{ key: 'C', value: '1' }],
      },
    ],
    computingResult: {
      accuracyScores: [0.8, 1],
      f1Scores: [0.7, 0.9],
      rocAucScores: [0.9, 0.9],
      predictionDataPercent: overrides.split ?? 20,
      sampleCount: 60,
      channelNames: ['a', 'b'],
      duration: 1,
    },
  }) as any;

const rowFor = (rows: ReturnType<typeof buildSettingsRows>, label: string) =>
  rows.find((row) => row.label === label)!;

test('two paths with the same technologies but different node parameters differ in settings', () => {
  const rows = buildSettingsRows(
    makeRun({ settings: [{ key: 'C', value: '1' }] }),
    makeRun({ settings: [{ key: 'C', value: '10' }] }),
    labels,
    format
  );

  assert.deepEqual(rowFor(rows, 'Node 1'), {
    label: 'Node 1',
    a: 'Normalization',
    b: 'Normalization',
    differs: false,
  });
  assert.deepEqual(rowFor(rows, 'Node 2'), {
    label: 'Node 2',
    a: 'SVM: C=1',
    b: 'SVM: C=10',
    differs: true,
  });
});

test('a different prediction data share is shown and highlighted', () => {
  const rows = buildSettingsRows(makeRun({ split: 20 }), makeRun({ split: 30 }), labels, format);

  assert.deepEqual(rowFor(rows, 'Prediction share'), {
    label: 'Prediction share',
    a: '20%',
    b: '30%',
    differs: true,
  });
  assert.equal(rowFor(rows, 'Folds').differs, false);
});

test('identical runs have no highlighted settings', () => {
  const rows = buildSettingsRows(makeRun({}), makeRun({}), labels, format);

  assert.equal(
    rows.some((row) => row.differs),
    false
  );
});

test('metric rows give the mean per run, the per-fold values and the B - A difference', () => {
  const [accuracy] = buildMetricRows(
    makeRun({}),
    { ...makeRun({}), computingResult: { ...makeRun({}).computingResult, accuracyScores: [1, 1] } },
    { accuracy: 'Accuracy', f1: 'F1', rocAuc: 'ROC AUC' }
  );

  assert.equal(accuracy.meanA, 0.9);
  assert.equal(accuracy.meanB, 1);
  assert.deepEqual(accuracy.foldsA, [0.8, 1]);
  assert.ok(Math.abs((accuracy.delta ?? 0) - 0.1) < 1e-9);
});

test('confusion matrix cells are compared as row percentages', () => {
  assert.equal(rowPercent(1, [1, 3]), 25);
  assert.equal(rowPercent(0, [0, 0]), 0);
});

test('equal means with different fold scores are highlighted per fold', () => {
  const runA = makeRun({});
  const runB = makeRun({});
  runA.computingResult.accuracyScores = [0.875, 0.625];
  runB.computingResult.accuracyScores = [0.625, 0.875];

  const [accuracy] = buildMetricRows(runA, runB, {
    accuracy: 'Accuracy',
    f1: 'F1',
    rocAuc: 'ROC AUC',
  });

  assert.equal(accuracy.meanA, accuracy.meanB);
  assert.equal(accuracy.meanDiffers, false);
  assert.deepEqual(accuracy.foldDiffers, [true, true]);
});

test('folds that round to the same shown score are not highlighted, a missing fold is', () => {
  assert.deepEqual(foldDiffers([0.12341, 0.5], [0.12344, 0.5, 0.7]), [false, false, true]);
});
