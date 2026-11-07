import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

import { config } from '../../../config/config';
import { PipelineModel } from '../../../core/pipeline/models/PipelineModel';
import { UserModel } from '../../../core/user';
import { createLeanResult, stub } from '../../../test/testUtils';
import { AuthFlow } from '../../auth/services/AuthFlow';
import { ExperimentModel } from '../models/ExperimentModel';
import { ExperimentReportService } from '../services/ExperimentReportService';
import { GraphManager } from '../services/GraphManager';
import { createExperimentReportHandler } from './experimentReport';

const owner = { _id: new Types.ObjectId(), email: 'owner@example.com' };
const otherUser = { _id: new Types.ObjectId(), email: 'other@example.com' };
const experimentId = new Types.ObjectId();
const pdf = Buffer.from('%PDF-1.4 report');

const bearer = (user: { _id: Types.ObjectId; email: string }) =>
  `Bearer ${jwt.sign({ sub: user._id.toString(), email: user.email }, config.jwtSecret)}`;

// The real handler, AuthFlow and report service over a real HTTP server; only the database and
// the PDF renderer are replaced.
const startServer = async (
  t: TestContext,
  render: (input: any) => Promise<Buffer> = async () => pdf
) => {
  const users = [owner, otherUser];
  stub(
    t,
    UserModel as unknown as Record<string, unknown>,
    'findById',
    (async (id: string) => users.find((user) => user._id.toString() === String(id)) ?? null) as any
  );
  const experimentQueries: Record<string, unknown>[] = [];
  stub(t, ExperimentModel as unknown as Record<string, unknown>, 'findOne', ((
    query: Record<string, unknown>
  ) => {
    experimentQueries.push(query);
    const owned =
      String(query._id) === experimentId.toString() &&
      String(query.createdById) === owner._id.toString();
    return createLeanResult(
      owned ? { _id: experimentId, name: 'Iris', createdById: owner._id } : null
    );
  }) as any);
  stub(
    t,
    GraphManager.prototype as unknown as Record<string, unknown>,
    'getByExperimentId',
    async () => ({ nodes: [] })
  );
  stub(t, PipelineModel as unknown as Record<string, unknown>, 'find', (() =>
    createLeanResult([])) as any);

  const app = express();
  app.get(
    '/experiments/:experimentId/report',
    createExperimentReportHandler(new AuthFlow(), new ExperimentReportService(render as any))
  );
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address() as AddressInfo;
  const request = (id: string, authorization?: string) =>
    fetch(`http://127.0.0.1:${port}/experiments/${id}/report`, {
      headers: authorization ? { authorization } : {},
    });
  return { request, experimentQueries };
};

test('the report needs a valid access token', async (t) => {
  const { request, experimentQueries } = await startServer(t);

  for (const authorization of [
    undefined,
    'Bearer not-a-jwt',
    `Bearer ${jwt.sign({ sub: owner._id.toString() }, 'another-secret')}`,
    `Bearer ${jwt.sign({ sub: owner._id.toString() }, config.jwtSecret, { expiresIn: -10 })}`,
  ]) {
    const response = await request(experimentId.toString(), authorization);
    assert.equal(response.status, 401, String(authorization));
    assert.equal(response.headers.get('www-authenticate'), 'Bearer');
    assert.deepEqual(await response.json(), { error: 'Not authenticated' });
  }
  // Nothing about the experiment is read before the caller is known.
  assert.deepEqual(experimentQueries, []);
});

test("another user's experiment gets the same 404 as a missing one", async (t) => {
  const { request, experimentQueries } = await startServer(t);

  const foreign = await request(experimentId.toString(), bearer(otherUser));
  const missing = await request(new Types.ObjectId().toString(), bearer(owner));

  assert.equal(foreign.status, 404);
  assert.deepEqual(await foreign.json(), { error: 'Experiment not found' });
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: 'Experiment not found' });
  // The owner is part of the query, so another user's experiment is never loaded.
  assert.equal(String(experimentQueries[0].createdById), otherUser._id.toString());
});

test('the owner downloads the PDF', async (t) => {
  const rendered: any[] = [];
  const { request } = await startServer(t, async (input: any) => {
    rendered.push(input);
    return pdf;
  });

  const response = await request(experimentId.toString(), bearer(owner));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.equal(
    response.headers.get('content-disposition'),
    `attachment; filename="experiment-${experimentId}-report.pdf"`
  );
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf);
  assert.equal(rendered[0].experimentName, 'Iris');
});

test('an invalid id is rejected and a failed report is a server error', async (t) => {
  const { request } = await startServer(t, async () => {
    throw new Error('Chromium crashed');
  });
  stub(t, console as unknown as Record<string, unknown>, 'error', () => undefined);

  const invalid = await request('not-an-id', bearer(owner));
  const failed = await request(experimentId.toString(), bearer(owner));

  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: 'Experiment _id is invalid' });
  assert.equal(failed.status, 500);
  assert.deepEqual(await failed.json(), { error: 'Failed to generate experiment report' });
});
