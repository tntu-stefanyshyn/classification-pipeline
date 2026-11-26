import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import React from 'react';

import { findElement, loadFreshModule, stubResolvedModule } from './testUtils';

const modulePath = path.resolve(
  __dirname,
  '../src/components/experiments/ComputationCard/components/CompareModal/CompareModal'
);
const compiledFile = `${modulePath}.js`;

type QueryState = { data?: unknown; loading?: boolean; error?: Error };

const render = (t: TestContext, queries: QueryState[]) => {
  stubResolvedModule(t, compiledFile, 'react', {
    ...React,
    useMemo: <T,>(factory: () => T) => factory(),
  });
  let call = 0;
  stubResolvedModule(t, compiledFile, './graphql', {
    usePipelineInfoQuery: () => {
      const query = queries[call % queries.length];
      call += 1;
      return { loading: false, ...query };
    },
  });
  const module =
    loadFreshModule<
      typeof import('../src/components/experiments/ComputationCard/components/CompareModal/CompareModal')
    >(modulePath);
  return module.default({ ids: ['run-a', 'run-b'], onClose: () => undefined });
};

const run = { data: { pipeline: { _id: 'x', pathNodes: [], queue: 'local' } } };

test('the comparison shows the loading label only while a query is pending', (t) => {
  const tree = render(t, [{ loading: true }, run]);

  assert.equal(
    findElement(tree, (element) => element.props?.className === 'error'),
    null
  );
});

test('a failed query ends the loading state with a message', (t) => {
  const tree = render(t, [run, { error: new Error('network') }]);

  assert.ok(findElement(tree, (element) => element.props?.className === 'error'));
});

test('a run that no longer exists ends the loading state with a message', (t) => {
  const tree = render(t, [run, { data: { pipeline: null } }]);

  assert.ok(findElement(tree, (element) => element.props?.className === 'error'));
});
