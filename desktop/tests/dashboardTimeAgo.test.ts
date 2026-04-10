import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatTimeAgo } from '../src/components/pages/DashboardPage/utils/formatTimeAgo';
import { stub } from './testUtils';

const FIXED_NOW = Date.UTC(2026, 3, 10, 12, 0, 0);

test('formatTimeAgo reports at least one hour for recent timestamps', (t) => {
  stub(t, Date, 'now', (() => FIXED_NOW) as typeof Date.now);

  assert.equal(formatTimeAgo(new Date(FIXED_NOW - 30 * 60 * 1000).toISOString()), '1 год тому');
  assert.equal(
    formatTimeAgo(new Date(FIXED_NOW - 5.8 * 60 * 60 * 1000).toISOString()),
    '5 год тому'
  );
});

test('formatTimeAgo switches to days after twenty four hours', (t) => {
  stub(t, Date, 'now', (() => FIXED_NOW) as typeof Date.now);

  assert.equal(formatTimeAgo(new Date(FIXED_NOW - 24 * 60 * 60 * 1000).toISOString()), '1 дн тому');
  assert.equal(formatTimeAgo(new Date(FIXED_NOW - 49 * 60 * 60 * 1000).toISOString()), '2 дн тому');
});

test('formatTimeAgo returns an empty string for invalid input', () => {
  assert.equal(formatTimeAgo('not-a-date'), '');
});
