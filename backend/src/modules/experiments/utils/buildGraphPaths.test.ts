import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildGraphPaths } from './buildGraphPaths';

test('buildGraphPaths returns every root-to-leaf path and keeps orphan roots', () => {
  const paths = buildGraphPaths([
    { _id: 'root', parentId: undefined } as any,
    { _id: 'left', parentId: 'root' } as any,
    { _id: 'right', parentId: 'root' } as any,
    { _id: 'orphan', parentId: 'missing' } as any,
  ]);

  assert.deepEqual(paths.map((path) => path.join('>')).sort(), [
    'orphan',
    'root>left',
    'root>right',
  ]);
});

test('buildGraphPaths avoids infinite recursion on cyclic branches', () => {
  const paths = buildGraphPaths([
    { _id: 'root', parentId: undefined } as any,
    { _id: 'cycle', parentId: 'root' } as any,
    { _id: 'cycle-leaf', parentId: 'cycle' } as any,
    { _id: 'cycle-leaf', parentId: 'cycle-leaf' } as any,
  ]);

  assert.deepEqual(paths, []);
});
