import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import React from 'react';

import {
  findElement,
  findElements,
  getElementName,
  loadFreshModule,
  stubResolvedModule,
} from './testUtils';

const modulePath = path.resolve(
  __dirname,
  '../src/pages/private/ExperimentDetailsPage/components/StatusGraphNode/StatusGraphNode'
);
const compiledFile = `${modulePath}.js`;

const createNodeProps = (data: Record<string, unknown>) =>
  ({
    id: String(data._id ?? 'node-1'),
    data,
    type: 'status',
    dragging: false,
    selected: false,
    zIndex: 1,
    isConnectable: true,
    xPos: 0,
    yPos: 0,
  }) as any;

test('StatusGraphNode root node renders only the localized title', (t) => {
  stubResolvedModule(t, compiledFile, 'reactflow', {
    Handle: (props: Record<string, unknown>) => React.createElement('handle', props),
    Position: { Bottom: 'bottom', Top: 'top' },
  });
  stubResolvedModule(t, compiledFile, '../../../../../i18n', {
    useI18n: () => ({
      messages: {
        graph: {
          node: {
            viewNode: 'Переглянути вузол',
          },
        },
      },
    }),
  });
  stubResolvedModule(
    t,
    compiledFile,
    '../../../../../components/experiments/ExperimentGraphConstructor',
    {
      getStageLabel: () => 'Етап',
    }
  );

  const { default: StatusGraphNode } = loadFreshModule<{
    default: (props: any) => React.ReactElement;
  }>(modulePath);
  const element = StatusGraphNode(
    createNodeProps({
      _id: 'root',
      label: 'Початок',
      isRoot: true,
      onInfo: () => undefined,
    })
  );

  const title = findElement(
    element,
    (node) => node.props.className === 'org-node-title' && node.props.children === 'Початок'
  );
  const meta = findElement(element, (node) => node.props.className === 'org-node-meta');

  assert.ok(title);
  assert.equal(meta, null);
});

test('StatusGraphNode uses localized label for the info button', (t) => {
  stubResolvedModule(t, compiledFile, 'reactflow', {
    Handle: (props: Record<string, unknown>) => React.createElement('handle', props),
    Position: { Bottom: 'bottom', Top: 'top' },
  });
  stubResolvedModule(t, compiledFile, '../../../../../i18n', {
    useI18n: () => ({
      messages: {
        graph: {
          node: {
            viewNode: 'View node',
          },
        },
      },
    }),
  });
  stubResolvedModule(
    t,
    compiledFile,
    '../../../../../components/experiments/ExperimentGraphConstructor',
    {
      getStageLabel: () => 'Preprocessing',
    }
  );

  const { default: StatusGraphNode } = loadFreshModule<{
    default: (props: any) => React.ReactElement;
  }>(modulePath);
  const element = StatusGraphNode(
    createNodeProps({
      _id: 'node-1',
      label: 'PCA',
      onInfo: () => undefined,
    })
  );

  const buttons = findElements(element, (node) => getElementName(node) === 'button');
  const infoButton = buttons.find((node) => node.props.className === 'btn ghost small icon');

  assert.ok(infoButton);
  assert.equal(infoButton.props['aria-label'], 'View node');
  assert.equal(infoButton.props.title, 'View node');
});
