import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatWeightPercent } from '../src/utils/metricWeights';

test('formatWeightPercent formats weights as trimmed percents', () => {
  assert.equal(formatWeightPercent(0.4), '40');
  assert.equal(formatWeightPercent(0.125), '12.5');
  assert.equal(formatWeightPercent(0.1234, 3), '12.34');
});

test('formatWeightPercent returns empty string for non-finite weights', () => {
  assert.equal(formatWeightPercent(undefined), '');
  assert.equal(formatWeightPercent(null), '');
  assert.equal(formatWeightPercent(Number.NaN), '');
  assert.equal(formatWeightPercent(Number.POSITIVE_INFINITY), '');
});
