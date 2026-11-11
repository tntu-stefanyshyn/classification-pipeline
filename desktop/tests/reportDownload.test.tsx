import assert from 'node:assert/strict';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import React from 'react';

import { createUseStateStub, loadFreshModule, stub, stubResolvedModule } from './testUtils';

const componentDir = path.resolve(__dirname, '../src/components/experiments/ReportDownloadButton');
const utilPath = path.join(componentDir, 'utils/downloadExperimentReport');
const buttonPath = path.join(componentDir, 'ReportDownloadButton');

type Saved = { href: string; download: string; clicked: boolean; removed: boolean };

// The real download code with a mocked transport and a minimal document.
type Session = { token: string | null; generation: number };
type Refresh = (session: Session) => Promise<string>;

const useDownloadEnvironment = (
  t: TestContext,
  respond: () => Promise<Response>,
  token: string | null = 'access-token',
  refresh: Refresh = async () => 'expired'
) => {
  const session: Session = { token, generation: 1 };
  const refreshes: Array<{ generation?: number; failedToken?: string | null }> = [];
  const requests: Array<{ url: string; headers: Record<string, string> }> = [];
  stub(t, globalThis as any, 'fetch', (async (url: string, init: RequestInit) => {
    requests.push({ url, headers: (init.headers ?? {}) as Record<string, string> });
    return respond();
  }) as any);

  const saved: Saved[] = [];
  const revoked: string[] = [];
  stub(t, URL as any, 'createObjectURL', () => 'blob:report-1');
  stub(t, URL as any, 'revokeObjectURL', (url: string) => revoked.push(url));
  const body = { appendChild: (link: Saved) => saved.push(link) };
  stub(t, globalThis as any, 'document', {
    body,
    createElement: () => {
      const link: Saved = { href: '', download: '', clicked: false, removed: false };
      return Object.assign(link, {
        click: () => (link.clicked = true),
        remove: () => (link.removed = true),
      });
    },
  });

  stubResolvedModule(t, `${utilPath}.js`, '../../../../config/config', {
    config: { renderer: { graphqlEndpoint: 'http://backend:4000/graphql' } },
  });
  stubResolvedModule(t, `${utilPath}.js`, '../../../../services/tokenService', {
    tokenService: { getToken: () => session.token, getGeneration: () => session.generation },
  });
  stubResolvedModule(t, `${utilPath}.js`, '../../../../graphql/session', {
    refreshSession: (generation?: number, failedToken?: string | null) => {
      refreshes.push({ generation, failedToken });
      return refresh(session);
    },
  });
  const util =
    loadFreshModule<
      typeof import('../src/components/experiments/ReportDownloadButton/utils/downloadExperimentReport')
    >(utilPath);
  return { util, requests, saved, revoked, refreshes };
};

const pdfResponse = () =>
  new Response(new Blob(['%PDF-1.4'], { type: 'application/pdf' }), {
    status: 200,
    headers: { 'content-type': 'application/pdf' },
  });

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test('the report is requested with the access token and saved as a file', async (t) => {
  const { util, requests, saved, revoked } = useDownloadEnvironment(t, async () => pdfResponse());

  await util.downloadExperimentReport('exp-1');
  await flush();

  assert.deepEqual(requests, [
    {
      url: 'http://backend:4000/experiments/exp-1/report',
      headers: { authorization: 'Bearer access-token' },
    },
  ]);
  assert.deepEqual(
    saved.map(({ href, download, clicked, removed }) => ({ href, download, clicked, removed })),
    [
      {
        href: 'blob:report-1',
        download: 'experiment-exp-1-report.pdf',
        clicked: true,
        removed: true,
      },
    ]
  );
  assert.deepEqual(revoked, ['blob:report-1']);
});

test('a refused report is an error and nothing is saved', async (t) => {
  const { util, saved } = useDownloadEnvironment(
    t,
    async () => new Response('{"error":"Experiment not found"}', { status: 404 }),
    null
  );

  await assert.rejects(util.downloadExperimentReport('exp-1'), (error: unknown) => {
    assert.ok(error instanceof util.ReportDownloadError);
    assert.equal(error.status, 404);
    return true;
  });
  assert.deepEqual(saved, []);
});

test('an expired access token is refreshed and the report requested once more', async (t) => {
  const answers = [new Response('', { status: 401 }), pdfResponse()];
  const { util, requests, saved, refreshes } = useDownloadEnvironment(
    t,
    async () => answers.shift()!,
    'expired-token',
    async (session) => {
      session.token = 'fresh-token';
      return 'refreshed';
    }
  );

  await util.downloadExperimentReport('exp-1');

  assert.deepEqual(refreshes, [{ generation: 1, failedToken: 'expired-token' }]);
  assert.deepEqual(
    requests.map((request) => request.headers),
    [{ authorization: 'Bearer expired-token' }, { authorization: 'Bearer fresh-token' }]
  );
  assert.equal(saved.length, 1);
});

test('a session that cannot be refreshed leaves the 401 and sends no retry', async (t) => {
  const { util, requests, saved } = useDownloadEnvironment(
    t,
    async () => new Response('', { status: 401 })
  );

  await assert.rejects(util.downloadExperimentReport('exp-1'), (error: unknown) => {
    assert.ok(error instanceof util.ReportDownloadError);
    assert.equal(error.status, 401);
    return true;
  });
  assert.equal(requests.length, 1);
  assert.deepEqual(saved, []);
});

test('a report is not retried in a session that changed during the refresh', async (t) => {
  const { util, requests } = useDownloadEnvironment(
    t,
    async () => new Response('', { status: 401 }),
    'expired-token',
    async (session) => {
      session.generation += 1;
      session.token = 'other-account-token';
      return 'refreshed';
    }
  );

  await assert.rejects(util.downloadExperimentReport('exp-1'), util.ReportDownloadError);
  assert.equal(requests.length, 1);
});

test('a refresh that cannot reach the backend rejects with its network error', async (t) => {
  const { util, requests } = useDownloadEnvironment(
    t,
    async () => new Response('', { status: 401 }),
    'expired-token',
    async () => {
      throw new TypeError('fetch failed');
    }
  );

  await assert.rejects(util.downloadExperimentReport('exp-1'), TypeError);
  assert.equal(requests.length, 1);
});

const loadButton = (t: TestContext, respond: () => Promise<Response>) => {
  const environment = useDownloadEnvironment(t, respond);
  const state = createUseStateStub();
  stubResolvedModule(t, `${buttonPath}.js`, 'react', { ...React, useState: state.useState });
  const toasts: unknown[] = [];
  stubResolvedModule(t, `${buttonPath}.js`, 'react-toastify', {
    toast: { error: (message: unknown) => toasts.push(message) },
  });
  stubResolvedModule(t, `${buttonPath}.js`, './utils/downloadExperimentReport', environment.util);
  // Loaded again, so it checks errors against the ReportDownloadError of this download module.
  stubResolvedModule(
    t,
    `${buttonPath}.js`,
    './utils/getReportErrorMessage',
    loadFreshModule(path.join(componentDir, 'utils/getReportErrorMessage'))
  );
  const module =
    loadFreshModule<
      typeof import('../src/components/experiments/ReportDownloadButton/ReportDownloadButton')
    >(buttonPath);
  return { ...environment, state, toasts, Button: module.default };
};

test('the download button saves the report and shows that it is busy meanwhile', async (t) => {
  const { Button, state, saved, toasts } = loadButton(t, async () => pdfResponse());

  const button = Button({ experimentId: 'exp-1', className: 'btn ghost small' }) as any;
  assert.equal(button.type, 'button');
  assert.equal(button.props.className, 'btn ghost small');
  assert.equal(button.props.children, 'Завантажити PDF');

  await button.props.onClick();

  assert.deepEqual(
    state.calls.map((call) => call.value),
    [true, false]
  );
  assert.equal(saved.length, 1);
  assert.deepEqual(toasts, []);
});

test('the download button explains why the report was not downloaded', async (t) => {
  const answers = [
    async () => new Response('', { status: 401 }),
    async () => new Response('', { status: 404 }),
    async () => new Response('', { status: 500 }),
    async () => {
      throw new TypeError('fetch failed');
    },
  ];
  let index = 0;
  const { Button, toasts, saved } = loadButton(t, () => answers[index++]());
  const button = Button({ experimentId: 'exp-1' }) as any;
  assert.equal(button.props.className, 'btn ghost');

  for (let attempt = 0; attempt < answers.length; attempt += 1) await button.props.onClick();

  assert.deepEqual(toasts, [
    'Увійдіть знову, щоб завантажити звіт.',
    'Звіт недоступний: експеримент не знайдено.',
    'Не вдалося сформувати звіт. Спробуйте ще раз.',
    'Немає звʼязку з сервером. Спробуйте пізніше.',
  ]);
  assert.deepEqual(saved, []);
});
