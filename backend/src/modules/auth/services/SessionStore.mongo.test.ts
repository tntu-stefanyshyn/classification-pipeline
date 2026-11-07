import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test, type TestContext } from 'node:test';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import { UserModel } from '../../../core/user';
import { stub } from '../../../test/testUtils';
import { AuthenticationError } from '../classes/AuthenticationError';
import { RefreshTokenModel } from '../models/RefreshTokenModel';
import { SessionModel } from '../models/SessionModel';
import { AuthFlow } from './AuthFlow';

// Rotation and reuse detection rely on conditional updates, which only a real MongoDB proves.
const uri = process.env.MONGODB_TEST_URI;
const skip = uri ? false : 'MONGODB_TEST_URI is not set';

const useDatabase = async (t: TestContext) => {
  await mongoose.connect(uri!, { dbName: `session-test-${process.pid}-${Date.now()}` });
  await RefreshTokenModel.createIndexes();
  await SessionModel.createIndexes();
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
  assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof AuthenticationError);
    assert.equal(error.message, 'Session expired');
    return true;
  });

// Holds the next successor write until the test releases it, so a revocation can land between
// "old token marked as used" and "successor stored".
const pauseNextIssue = (t: TestContext) => {
  const create = RefreshTokenModel.create.bind(RefreshTokenModel);
  let reached!: () => void;
  let release!: () => void;
  const paused = new Promise<void>((resolve) => (reached = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));
  stub(t, RefreshTokenModel as unknown as Record<string, unknown>, 'create', (async (
    ...args: Parameters<typeof create>
  ) => {
    reached();
    await released;
    return create(...args);
  }) as any);
  return { paused, release };
};

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
  const stored = await SessionModel.find({ userId: session.user._id }).lean();
  assert.equal(stored.length, 1);
  assert.ok(stored[0].revokedAt);
});

test('parallel exchanges of one token leave no usable successor', { skip }, async (t) => {
  await useDatabase(t);
  const { flow, session } = await startSession();

  const results = await Promise.allSettled([
    flow.refreshSession(session.refreshToken),
    flow.refreshSession(session.refreshToken),
  ]);

  assert.ok(results.filter((result) => result.status === 'fulfilled').length <= 1);
  // The second exchange is a reuse: whatever the first one got cannot be exchanged again.
  for (const result of results) {
    if (result.status === 'fulfilled') {
      await rejectsAsExpired(flow.refreshSession(result.value.refreshToken));
    }
  }
});

test('logout while the successor is being stored keeps it from the client', { skip }, async (t) => {
  await useDatabase(t);
  const { flow, session } = await startSession();
  const pause = pauseNextIssue(t);

  const refreshing = flow.refreshSession(session.refreshToken);
  await pause.paused;
  await flow.logout(session.refreshToken);
  pause.release();

  await rejectsAsExpired(refreshing);
  const stored = await SessionModel.findById((await RefreshTokenModel.findOne().lean())!.familyId);
  assert.ok(stored?.revokedAt);
});

test(
  'reuse detection while the successor is being stored keeps it from the client',
  { skip },
  async (t) => {
    await useDatabase(t);
    const { flow, session } = await startSession();
    const pause = pauseNextIssue(t);

    const refreshing = flow.refreshSession(session.refreshToken);
    await pause.paused;
    // The same token again: a copy. Its exchange revokes the session while the first one waits.
    await rejectsAsExpired(flow.refreshSession(session.refreshToken));
    pause.release();

    await rejectsAsExpired(refreshing);
  }
);

test(
  'a token that was stored after its session was revoked cannot be exchanged',
  { skip },
  async (t) => {
    await useDatabase(t);
    const { flow, session } = await startSession();
    const { familyId, userId } = (await RefreshTokenModel.findOne().lean())!;
    await flow.logout(session.refreshToken);
    // The state the race left behind before the fix: a successor without its own revokedAt.
    const late = 'successor-stored-after-revocation';
    await RefreshTokenModel.create({
      userId,
      familyId,
      tokenHash: createHash('sha256').update(late).digest('hex'),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await rejectsAsExpired(flow.refreshSession(late));
  }
);

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
    const sessionIndexes = await SessionModel.collection.indexes();
    assert.ok(
      sessionIndexes.some((index) => index.key.expiresAt === 1 && index.expireAfterSeconds === 0)
    );
    // Each rotation extends the session to the expiry of its newest token.
    const before = (await SessionModel.findOne().lean())!.expiresAt;
    await new Promise((resolve) => setTimeout(resolve, 5));
    await new AuthFlow().refreshSession(session.refreshToken);
    assert.ok((await SessionModel.findOne().lean())!.expiresAt > before);
  }
);

const hashOf = (token: string) => createHash('sha256').update(token).digest('hex');

test(
  'a used token presented after it expired still ends the session it was copied from',
  { skip },
  async (t) => {
    await useDatabase(t);
    const { flow, session } = await startSession();
    // Someone else exchanged the copy and keeps the session alive with its successors.
    const copied = await flow.refreshSession(session.refreshToken);
    await RefreshTokenModel.updateOne(
      { tokenHash: hashOf(session.refreshToken) },
      { $set: { expiresAt: new Date(Date.now() - 1000) } }
    );

    await rejectsAsExpired(flow.refreshSession(session.refreshToken));
    await rejectsAsExpired(flow.refreshSession(copied.refreshToken));
  }
);

test(
  'a token whose record MongoDB already removed still ends its active session',
  { skip },
  async (t) => {
    await useDatabase(t);
    const { flow, session } = await startSession();
    const copied = await flow.refreshSession(session.refreshToken);
    // What the TTL index does once the used token expires.
    await RefreshTokenModel.deleteOne({ tokenHash: hashOf(session.refreshToken) });

    await rejectsAsExpired(flow.refreshSession(session.refreshToken));
    await rejectsAsExpired(flow.refreshSession(copied.refreshToken));
    assert.ok((await SessionModel.findOne().lean())?.revokedAt);
  }
);

test('a forged token that names a session does not end it', { skip }, async (t) => {
  await useDatabase(t);
  const { flow, session } = await startSession();
  const [sessionId, nonce] = session.refreshToken.split('.');

  await rejectsAsExpired(flow.refreshSession(`${sessionId}.${nonce}.not-our-signature`));
  assert.equal(await flow.logout(`${sessionId}.other.not-our-signature`), true);

  // Only a token the backend signed can name the session to end.
  assert.ok(await flow.refreshSession(session.refreshToken));
});

test('the same attempt after a lost answer gets the same refresh token', { skip }, async (t) => {
  await useDatabase(t);
  const { flow, session } = await startSession();

  // The first answer never reached the client, so it repeats the exchange with the same attempt.
  const lost = await flow.refreshSession(session.refreshToken, 'attempt-1');
  const repeated = await flow.refreshSession(session.refreshToken, 'attempt-1');

  assert.equal(repeated.refreshToken, lost.refreshToken);
  assert.ok(await flow.refreshSession(repeated.refreshToken, 'attempt-2'));
  assert.equal((await SessionModel.findOne().lean())?.revokedAt, undefined);
});

test('parallel exchanges of one attempt return the same refresh token', { skip }, async (t) => {
  await useDatabase(t);
  const { flow, session } = await startSession();

  const [first, second] = await Promise.all([
    flow.refreshSession(session.refreshToken, 'attempt-1'),
    flow.refreshSession(session.refreshToken, 'attempt-1'),
  ]);

  assert.equal(first.refreshToken, second.refreshToken);
  assert.ok(await flow.refreshSession(first.refreshToken));
});

test('another attempt with a used token is still reuse', { skip }, async (t) => {
  await useDatabase(t);
  const { flow, session } = await startSession();
  const next = await flow.refreshSession(session.refreshToken, 'attempt-1');

  await rejectsAsExpired(flow.refreshSession(session.refreshToken, 'attempt-2'));
  await rejectsAsExpired(flow.refreshSession(session.refreshToken));
  await rejectsAsExpired(flow.refreshSession(next.refreshToken));
});

test('repeating an attempt whose refresh token was used since is reuse', { skip }, async (t) => {
  await useDatabase(t);
  const { flow, session } = await startSession();
  const next = await flow.refreshSession(session.refreshToken, 'attempt-1');
  const third = await flow.refreshSession(next.refreshToken, 'attempt-2');

  await rejectsAsExpired(flow.refreshSession(session.refreshToken, 'attempt-1'));
  await rejectsAsExpired(flow.refreshSession(third.refreshToken));
});

test('an attempt whose successor was never stored can be completed', { skip }, async (t) => {
  await useDatabase(t);
  const { flow, session } = await startSession();
  const create = RefreshTokenModel.create.bind(RefreshTokenModel);
  let failures = 1;
  stub(t, RefreshTokenModel as unknown as Record<string, unknown>, 'create', (async (
    ...args: Parameters<typeof create>
  ) => {
    if (failures-- > 0) throw new Error('connection lost');
    return create(...args);
  }) as any);

  // The old token was marked as used, but its successor was not stored.
  await assert.rejects(flow.refreshSession(session.refreshToken, 'attempt-1'), /connection lost/);
  const next = await flow.refreshSession(session.refreshToken, 'attempt-1');

  assert.ok(await flow.refreshSession(next.refreshToken));
});

test(
  'repeating an attempt whose session was not extended extends it to the successor',
  { skip },
  async (t) => {
    await useDatabase(t);
    const { flow, session } = await startSession();
    // The session is about to end with the token that is being exchanged.
    const soon = new Date(Date.now() + 60_000);
    await SessionModel.updateMany({}, { $set: { expiresAt: soon } });
    await RefreshTokenModel.updateMany({}, { $set: { expiresAt: soon } });
    const updateOne = SessionModel.updateOne.bind(SessionModel) as (...args: unknown[]) => unknown;
    let failures = 1;
    stub(t, SessionModel as unknown as Record<string, unknown>, 'updateOne', ((
      filter: unknown,
      update: object,
      ...rest: unknown[]
    ) => {
      // The successor is stored, then extending the session fails.
      if ('$max' in update && failures-- > 0) throw new Error('connection lost');
      return updateOne(filter, update, ...rest);
    }) as any);

    await assert.rejects(flow.refreshSession(session.refreshToken, 'attempt-1'), /connection lost/);
    const next = await flow.refreshSession(session.refreshToken, 'attempt-1');

    const successor = (await RefreshTokenModel.findOne({
      tokenHash: hashOf(next.refreshToken),
    }).lean())!;
    const stored = (await SessionModel.findOne().lean())!;
    assert.equal(stored.expiresAt.getTime(), successor.expiresAt.getTime());
    assert.ok(stored.expiresAt > soon);
  }
);
