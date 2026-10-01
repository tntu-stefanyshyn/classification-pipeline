import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadFreshModule, stubResolvedModule } from './testUtils';

const routerModulePath = path.resolve(__dirname, '../src/router/AppRouter/AppRouter');
const routerCompiledFile = path.resolve(__dirname, '../src/router/AppRouter/AppRouter.js');

const createReactRouterDomStub = (currentPath: string) => {
  const normalize = (value: string) => {
    if (!value) return '/';
    const trimmed = value.replace(/\/+$/, '');
    return trimmed || '/';
  };

  const matchesPath = (routePath: string, nextPath: string) => {
    if (routePath === '*') return true;
    const routeParts = normalize(routePath).split('/').filter(Boolean);
    const pathParts = normalize(nextPath).split('/').filter(Boolean);
    if (routeParts.length !== pathParts.length) return false;
    return routeParts.every((part, index) => part.startsWith(':') || part === pathParts[index]);
  };

  return {
    HashRouter: ({ children }: any) => React.createElement(React.Fragment, null, children),
    Route: (_props: any) => null,
    Navigate: ({ to }: any) =>
      React.createElement('div', { 'data-navigate': to }, `navigate:${to}`),
    Routes: ({ children }: any) => {
      const routes = React.Children.toArray(children) as any[];
      const exactMatch = routes.find((route) => matchesPath(route.props.path, currentPath));
      const fallback = routes.find((route) => route.props.path === '*');
      return exactMatch?.props.element ?? fallback?.props.element ?? null;
    },
  };
};

const stubRouterPages = (t: any) => {
  stubResolvedModule(t, routerCompiledFile, '../../pages/private/DashboardPage', {
    DashboardPage: ({ onLogout }: any) =>
      React.createElement('div', {
        'data-page': 'dashboard',
        'data-logout': String(Boolean(onLogout)),
      }),
  });
  stubResolvedModule(t, routerCompiledFile, '../../pages/private/ExperimentsPage', {
    ExperimentsPage: ({ onLogout }: any) =>
      React.createElement('div', {
        'data-page': 'experiments',
        'data-logout': String(Boolean(onLogout)),
      }),
  });
  stubResolvedModule(t, routerCompiledFile, '../../pages/private/ExperimentDetailsPage', {
    ExperimentDetailsPage: ({ onLogout }: any) =>
      React.createElement('div', {
        'data-page': 'experiment-details',
        'data-logout': String(Boolean(onLogout)),
      }),
  });
  stubResolvedModule(t, routerCompiledFile, '../../pages/private/ExperimentConstructorPage', {
    ExperimentConstructorPage: () =>
      React.createElement('div', { 'data-page': 'experiment-constructor' }),
  });
  stubResolvedModule(t, routerCompiledFile, '../../pages/private/FilesPage', {
    FilesPage: ({ onLogout }: any) =>
      React.createElement('div', {
        'data-page': 'files',
        'data-logout': String(Boolean(onLogout)),
      }),
  });
  stubResolvedModule(t, routerCompiledFile, '../../pages/public/LoginPage', {
    LoginPage: ({ onLoginSuccess }: any) =>
      React.createElement('div', {
        'data-page': 'login',
        'data-login': String(Boolean(onLoginSuccess)),
      }),
  });
  stubResolvedModule(t, routerCompiledFile, '../../pages/public/RegisterPage', {
    RegisterPage: ({ onRegisterSuccess }: any) =>
      React.createElement('div', {
        'data-page': 'register',
        'data-register': String(Boolean(onRegisterSuccess)),
      }),
  });
};

test('AppRouter redirects unauthenticated users away from private routes', (t) => {
  stubResolvedModule(t, routerCompiledFile, 'react-router-dom', createReactRouterDomStub('/app'));
  stubRouterPages(t);
  stubResolvedModule(t, routerCompiledFile, './graphql', {
    useMeQuery: () => ({ data: null, loading: false, error: null }),
  });
  stubResolvedModule(t, routerCompiledFile, '../../services/tokenService', {
    tokenService: { clearToken: () => undefined },
  });

  const module =
    loadFreshModule<typeof import('../src/router/AppRouter/AppRouter')>(routerModulePath);
  const html = renderToStaticMarkup(
    React.createElement(module.default, {
      isAuthenticated: false,
      onLoginSuccess: () => undefined,
      onLogout: () => undefined,
    })
  );

  assert.match(html, /navigate:\/login/);
});

test('AppRouter renders authenticated pages when me query resolves', (t) => {
  stubResolvedModule(
    t,
    routerCompiledFile,
    'react-router-dom',
    createReactRouterDomStub('/app/experiments')
  );
  stubRouterPages(t);
  stubResolvedModule(t, routerCompiledFile, './graphql', {
    useMeQuery: () => ({ data: { me: { _id: 'user-1' } }, loading: false, error: null }),
  });
  stubResolvedModule(t, routerCompiledFile, '../../services/tokenService', {
    tokenService: { clearToken: () => undefined },
  });

  const module =
    loadFreshModule<typeof import('../src/router/AppRouter/AppRouter')>(routerModulePath);
  const html = renderToStaticMarkup(
    React.createElement(module.default, {
      isAuthenticated: true,
      onLoginSuccess: () => undefined,
      onLogout: () => undefined,
    })
  );

  assert.match(html, /data-page="experiments"/);
});

test('AppRouter returns null while authenticated me query is loading', (t) => {
  stubResolvedModule(t, routerCompiledFile, 'react-router-dom', createReactRouterDomStub('/app'));
  stubRouterPages(t);
  stubResolvedModule(t, routerCompiledFile, './graphql', {
    useMeQuery: () => ({ data: null, loading: true, error: null }),
  });
  stubResolvedModule(t, routerCompiledFile, '../../services/tokenService', {
    tokenService: { clearToken: () => undefined },
  });

  const module =
    loadFreshModule<typeof import('../src/router/AppRouter/AppRouter')>(routerModulePath);
  const html = renderToStaticMarkup(
    React.createElement(module.default, {
      isAuthenticated: true,
      onLoginSuccess: () => undefined,
      onLogout: () => undefined,
    })
  );

  assert.equal(html, '');
});

test('AppRouter clears token when me query returns an error', (t) => {
  const clearCalls: string[] = [];
  stubResolvedModule(t, routerCompiledFile, 'react', {
    ...React,
    useEffect: (effect: () => void) => effect(),
  });
  stubResolvedModule(t, routerCompiledFile, 'react-router-dom', createReactRouterDomStub('/app'));
  stubRouterPages(t);
  stubResolvedModule(t, routerCompiledFile, './graphql', {
    useMeQuery: () => ({ data: null, loading: false, error: new Error('unauthorized') }),
  });
  stubResolvedModule(t, routerCompiledFile, '../../services/tokenService', {
    tokenService: { clearToken: () => clearCalls.push('clear') },
  });

  const module =
    loadFreshModule<typeof import('../src/router/AppRouter/AppRouter')>(routerModulePath);
  module.default({
    isAuthenticated: true,
    onLoginSuccess: () => undefined,
    onLogout: () => undefined,
  } as any);

  assert.deepEqual(clearCalls, ['clear']);
});
