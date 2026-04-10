import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import React from 'react';

import { loadFreshModule, stubResolvedModule } from './testUtils';

const rendererModulePath = path.resolve(__dirname, '../src/renderer');
const rendererCompiledFile = path.resolve(__dirname, '../src/renderer.js');

test('renderer creates a root and mounts App into the root container', (t) => {
  const rootElement = { id: 'root' };
  const renderCalls: any[] = [];
  const appComponent = () => React.createElement('div', null, 'app');

  const previousDocument = (globalThis as any).document;
  (globalThis as any).document = {
    getElementById: (id: string) => (id === 'root' ? rootElement : null),
  };
  t.after(() => {
    (globalThis as any).document = previousDocument;
  });

  stubResolvedModule(t, rendererCompiledFile, 'react-dom/client', {
    __esModule: true,
    default: {
      createRoot: (element: unknown) => {
        renderCalls.push(['createRoot', element]);
        return {
          render: (node: unknown) => {
            renderCalls.push(['render', node]);
          },
        };
      },
    },
  });
  stubResolvedModule(t, rendererCompiledFile, './App', {
    App: appComponent,
  });

  loadFreshModule(rendererModulePath);

  assert.deepEqual(renderCalls[0], ['createRoot', rootElement]);
  assert.equal((renderCalls[1]?.[1] as any)?.type, appComponent);
});

test('renderer throws when root container is missing', (t) => {
  const previousDocument = (globalThis as any).document;
  (globalThis as any).document = {
    getElementById: () => null,
  };
  t.after(() => {
    (globalThis as any).document = previousDocument;
  });

  stubResolvedModule(t, rendererCompiledFile, 'react-dom/client', {
    __esModule: true,
    default: {
      createRoot: () => {
        throw new Error('createRoot should not be called');
      },
    },
  });
  stubResolvedModule(t, rendererCompiledFile, './App', {
    App: () => React.createElement('div', null, 'app'),
  });

  assert.throws(() => loadFreshModule(rendererModulePath), /Root container not found/);
});
