import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ensureFile, ignoreCssImports, loadFreshModule, stubResolvedModule } from './testUtils';

const appModulePath = path.resolve(__dirname, '../src/App/App');
const appCompiledFile = path.resolve(__dirname, '../src/App/App.js');

test('App derives auth state from token and wires router callbacks', (t) => {
  ignoreCssImports(t);
  ensureFile(path.resolve(__dirname, '../src/index.css'));

  const routerProps: any[] = [];
  const tokenCalls: any[] = [];

  stubResolvedModule(t, appCompiledFile, '../router/AppRouter', {
    AppRouter: (props: any) => {
      routerProps.push(props);
      return React.createElement('div', null, 'router');
    },
  });
  stubResolvedModule(t, appCompiledFile, '../graphql/client', {
    apolloClient: { kind: 'apollo-client' },
  });
  stubResolvedModule(t, appCompiledFile, '../services/tokenService', {
    tokenService: {
      setSession: (value: unknown) => tokenCalls.push(['setSession', value]),
    },
    useAuthToken: () => 'token-1',
  });
  stubResolvedModule(t, appCompiledFile, '../graphql/session', {
    endSession: async () => tokenCalls.push(['endSession']),
  });
  stubResolvedModule(t, appCompiledFile, '@apollo/client/react', {
    ApolloProvider: ({ children }: any) => React.createElement(React.Fragment, null, children),
  });
  stubResolvedModule(t, appCompiledFile, 'react-toastify', {
    ToastContainer: () => React.createElement('div', null, 'toast'),
  });

  const module = loadFreshModule<typeof import('../src/App/App')>(appModulePath);
  const html = renderToStaticMarkup(React.createElement(module.default));

  assert.match(html, /router/);
  assert.match(html, /toast/);
  assert.equal(routerProps[0]?.isAuthenticated, true);

  routerProps[0].onLoginSuccess({ token: 'next-token', refreshToken: 'next-refresh' });
  routerProps[0].onLogout();

  assert.deepEqual(tokenCalls, [
    ['setSession', { token: 'next-token', refreshToken: 'next-refresh' }],
    ['endSession'],
  ]);
});

test('App tells the user when the backend has not confirmed a sign-out', async (t) => {
  ignoreCssImports(t);
  ensureFile(path.resolve(__dirname, '../src/index.css'));

  const routerProps: any[] = [];
  const warnings: unknown[] = [];

  stubResolvedModule(t, appCompiledFile, '../router/AppRouter', {
    AppRouter: (props: any) => {
      routerProps.push(props);
      return React.createElement('div', null, 'router');
    },
  });
  stubResolvedModule(t, appCompiledFile, '../graphql/client', {
    apolloClient: { kind: 'apollo-client' },
  });
  stubResolvedModule(t, appCompiledFile, '../services/tokenService', {
    tokenService: { setSession: () => undefined },
    useAuthToken: () => 'token-1',
  });
  let confirmed = false;
  stubResolvedModule(t, appCompiledFile, '../graphql/session', {
    endSession: async () => confirmed,
  });
  stubResolvedModule(t, appCompiledFile, '@apollo/client/react', {
    ApolloProvider: ({ children }: any) => React.createElement(React.Fragment, null, children),
  });
  stubResolvedModule(t, appCompiledFile, 'react-toastify', {
    ToastContainer: () => React.createElement('div', null, 'toast'),
    toast: { warn: (message: unknown) => warnings.push(message) },
  });

  const module = loadFreshModule<typeof import('../src/App/App')>(appModulePath);
  renderToStaticMarkup(React.createElement(module.default));
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  routerProps[0].onLogout();
  await flush();
  confirmed = true;
  routerProps[0].onLogout();
  await flush();

  assert.deepEqual(warnings, [
    'Ви вийшли на цьому пристрої. Сервер завершить сеанс, щойно буде доступний.',
  ]);
});

test('App passes unauthenticated state when no token is present', (t) => {
  ignoreCssImports(t);
  ensureFile(path.resolve(__dirname, '../src/index.css'));

  const routerProps: any[] = [];

  stubResolvedModule(t, appCompiledFile, '../router/AppRouter', {
    AppRouter: (props: any) => {
      routerProps.push(props);
      return React.createElement('div', null, 'router');
    },
  });
  stubResolvedModule(t, appCompiledFile, '../graphql/client', {
    apolloClient: { kind: 'apollo-client' },
  });
  stubResolvedModule(t, appCompiledFile, '../services/tokenService', {
    tokenService: {
      setSession: () => undefined,
    },
    useAuthToken: () => null,
  });
  stubResolvedModule(t, appCompiledFile, '../graphql/session', {
    endSession: async () => undefined,
  });
  stubResolvedModule(t, appCompiledFile, '@apollo/client/react', {
    ApolloProvider: ({ children }: any) => React.createElement(React.Fragment, null, children),
  });
  stubResolvedModule(t, appCompiledFile, 'react-toastify', {
    ToastContainer: () => React.createElement('div', null, 'toast'),
  });

  const module = loadFreshModule<typeof import('../src/App/App')>(appModulePath);
  renderToStaticMarkup(React.createElement(module.default));

  assert.equal(routerProps[0]?.isAuthenticated, false);
});
