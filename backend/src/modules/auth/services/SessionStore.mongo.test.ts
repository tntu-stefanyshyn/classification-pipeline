import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import { UserModel } from '../../../core/user';
import { UNAUTHENTICATED } from '../errors';
import { RefreshTokenModel } from '../models/RefreshTokenModel';
import { AuthFlow } from './AuthFlow';

// Rotation and reuse detection rely on conditional updates, which only a real MongoDB proves.
const uri = process.env.MONGODB_TEST_URI;
const skip = uri ? false : 'MONGODB_TEST_URI is not set';

const useDatabase = async (t: TestContext) => {
  await mongoose.connect(uri!, { dbName: `session-test-${process.pid}-${Date.now()}` });
  await RefreshTokenModel.createIndexes();
  t.after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
};

const startSession = async () => {
  const email = `user-${Date.now()}@example.com`;
  await UserModel.create({ email, passwordHash: await bcrypt.hash('secret', 4) });
  const flow = new AuthFlow();
  const session = await flow.login({ email, password: 'secret' });
  return { flow, session };
};

const rejectsAsExpired = (promise: Promise<unknown>) =>
  assert.rejects(promise, (error: any) => {
    assert.equal(error.message, 'Session expired');
    assert.equal(error.extensions?.code, UNAUTHENTICATED);
    return true;
  });

test('refreshSession rotates the refresh token', { skip }, async (t) => {
  await useDatabase(t);
  const { flow, session } = await startSession();

  const next = await flow.refreshSession(session.refreshToken);

  assert.notEqual(next.refreshToken, session.refreshToken);
  assert.equal(typeof next.token, 'string');
  assert.equal(String(next.user._id), String(session.user._id));
  const third = await flow.refreshSession(next.refreshToken);
  assert.ok(third.refreshToken);
});

test('a reused refresh token is rejected and ends the whole session', { skip }, async (t) => {
  await useDatabase(t);
  const { flow, session } = await startSession();
  const next = await flow.refreshSession(session.refreshToken);

  await rejectsAsExpired(flow.refreshSession(session.refreshToken));
  // The token issued by the legitimate rotation is revoked too.
  await rejectsAsExpired(flow.refreshSession(next.refreshToken));
  const tokens = await RefreshTokenModel.find({ userId: session.user._id }).lean();
  assert.equal(tokens.length, 2);
  assert.ok(tokens.every((token) => token.revokedAt));
});

test('of two parallel exchanges of one token only one succeeds', { skip }, async (t) => {
  await useDatabase(t);
  const { flow, session } = await startSession();

  const results = await Promise.allSettled([
    flow.refreshSession(session.refreshToken),
    flow.refreshSession(session.refreshToken),
  ]);

  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
});

test('an expired refresh token is rejected', { skip }, async (t) => {
  await useDatabase(t);
  const { flow, session } = await startSession();
  await RefreshTokenModel.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });

  await rejectsAsExpired(flow.refreshSession(session.refreshToken));
});

test('an unknown refresh token is rejected', { skip }, async (t) => {
  await useDatabase(t);
  const flow = new AuthFlow();

  await rejectsAsExpired(flow.refreshSession('not-a-token'));
  await rejectsAsExpired(flow.refreshSession(''));
});

test('logout revokes the session and ignores unknown tokens', { skip }, async (t) => {
  await useDatabase(t);
  const { flow, session } = await startSession();

  assert.equal(await flow.logout(session.refreshToken), true);
  assert.equal(await flow.logout('not-a-token'), true);

  await rejectsAsExpired(flow.refreshSession(session.refreshToken));
});

test(
  'refresh tokens are stored as hashes and removed by MongoDB after they expire',
  { skip },
  async (t) => {
    await useDatabase(t);
    const { session } = await startSession();

    const stored = await RefreshTokenModel.findOne().lean();
    assert.ok(stored);
    assert.notEqual(stored.tokenHash, session.refreshToken);
    const indexes = await RefreshTokenModel.collection.indexes();
    assert.ok(indexes.some((index) => index.key.expiresAt === 1 && index.expireAfterSeconds === 0));
    assert.ok(indexes.some((index) => index.key.tokenHash === 1 && index.unique));
  }
);
