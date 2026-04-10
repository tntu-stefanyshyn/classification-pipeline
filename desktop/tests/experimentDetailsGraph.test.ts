import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildGraphPaths } from '../src/components/pages/ExperimentDetailsPage/utils/buildGraphPaths';
import { countGraphPaths } from '../src/components/pages/ExperimentDetailsPage/utils/countGraphPaths';

type GraphNodeInput = {
  _id: string;
  parentId?: string | null;
  technology?: string | null;
  label?: string | null;
};

const asGraphNodes = (nodes: GraphNodeInput[]) =>
  nodes as Parameters<typeof buildGraphPaths>[0] & Parameters<typeof countGraphPaths>[0];

test('buildGraphPaths returns labeled root to leaf paths', () => {
  const paths = buildGraphPaths(
    asGraphNodes([
      { _id: 'root', technology: 'Upload' },
      { _id: 'pre', parentId: 'root', label: 'Preprocess' },
      { _id: 'model', parentId: 'pre', technology: 'SVM' },
      { _id: 'orphan', parentId: 'missing-parent', label: 'Detached' },
    ])
  ).sort((left, right) => left.id.localeCompare(right.id));

  assert.deepEqual(paths, [
    {
      id: 'orphan',
      nodeIds: ['orphan'],
      label: 'Detached',
    },
    {
      id: 'root.pre.model',
      nodeIds: ['root', 'pre', 'model'],
      label: 'Upload -> Preprocess -> SVM',
    },
  ]);
});

test('buildGraphPaths falls back to Unknown node when label data is missing', () => {
  const [path] = buildGraphPaths(asGraphNodes([{ _id: 'root' }]));

  assert.deepEqual(path, {
    id: 'root',
    nodeIds: ['root'],
    label: 'Unknown node',
  });
});

test('countGraphPaths counts every visible root to leaf combination', () => {
  const count = countGraphPaths(
    asGraphNodes([
      { _id: 'root' },
      { _id: 'left', parentId: 'root' },
      { _id: 'right', parentId: 'root' },
      { _id: 'right-a', parentId: 'right' },
      { _id: 'right-b', parentId: 'right' },
    ])
  );

  assert.equal(count, 3);
});

test('countGraphPaths returns zero when the graph has no roots', () => {
  const count = countGraphPaths(
    asGraphNodes([
      { _id: 'a', parentId: 'b' },
      { _id: 'b', parentId: 'a' },
    ])
  );

  assert.equal(count, 0);
});
