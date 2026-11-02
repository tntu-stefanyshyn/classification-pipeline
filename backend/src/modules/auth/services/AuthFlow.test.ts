import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

import { config } from '../../../config/config';
import { UserModel } from '../../../core/user';
import { stub } from '../../../test/testUtils';
import { RefreshTokenModel } from '../models/RefreshTokenModel';
import { SessionModel } from '../models/SessionModel';
import { AuthFlow } from './AuthFlow';

const stubRefreshTokens = (t: TestContext) => {
  const created: any[] = [];
  stub(t, RefreshTokenModel as unknown as Record<string, unknown>, 'create', async (doc: any) => {
    created.push(doc);
    return doc;
  });
  stub(t, SessionModel as unknown as Record<string, unknown>, 'create', async (doc: any) => doc);
  stub(t, SessionModel as unknown as Record<string, unknown>, 'updateOne', async () => ({}));
  return created;
};

test('AuthFlow.register normalizes user data and returns a token', async (t) => {
  const authFlow = new AuthFlow();
  const refreshTokens = stubRefreshTokens(t);
  const createdUser = {
    _id: new Types.ObjectId(),
    email: 'user@example.com',
    name: 'Ivan',
    passwordHash: 'hashed-password',
  };
  const createCalls: Array<Record<string, unknown>> = [];

  stub(t, UserModel as unknown as Record<string, unknown>, 'findOne', async () => null);
  stub(
    t,
    bcrypt as unknown as Record<string, unknown>,
    'hash',
    async (password: string, rounds: number) => {
      assert.equal(password, 'secret');
      assert.equal(rounds, 12);
      return 'hashed-password';
    }
  );
  stub(t, UserModel as unknown as Record<string, unknown>, 'create', async (input: any) => {
    createCalls.push(input);
    return createdUser;
  });

  const result = await authFlow.register({
    email: '  User@Example.com  ',
    password: 'secret',
    name: '  Ivan  ',
  } as any);

  assert.equal(createCalls.length, 1);
  assert.deepEqual(createCalls[0], {
    email: 'user@example.com',
    passwordHash: 'hashed-password',
    name: 'Ivan',
  });
  assert.equal(result.user, createdUser);
  assert.equal(typeof result.token, 'string');
  assert.ok(result.token.length > 20);
  assert.equal(refreshTokens.length, 1);
  assert.equal(String(refreshTokens[0].userId), String(createdUser._id));
});

test('AuthFlow.register rejects duplicate emails', async (t) => {
  const authFlow = new AuthFlow();

  stub(t, UserModel as unknown as Record<string, unknown>, 'findOne', async () => ({
    _id: new Types.ObjectId(),
  }));

  await assert.rejects(
    () =>
      authFlow.register({
        email: 'user@example.com',
        password: 'secret',
      } as any),
    /User already exists/
  );
});

test('AuthFlow.login returns an access token and a refresh token', async (t) => {
  const authFlow = new AuthFlow();
  const refreshTokens = stubRefreshTokens(t);
  const user = {
    _id: new Types.ObjectId(),
    email: 'user@example.com',
    passwordHash: 'stored-hash',
  };

  stub(t, UserModel as unknown as Record<string, unknown>, 'findOne', async () => user);
  stub(
    t,
    bcrypt as unknown as Record<string, unknown>,
    'compare',
    async (password: string, passwordHash: string) => {
      assert.equal(password, 'secret');
      assert.equal(passwordHash, 'stored-hash');
      return true;
    }
  );

  const result = await authFlow.login({
    email: ' USER@example.com ',
    password: 'secret',
  } as any);

  assert.equal(result.user, user);
  assert.equal(typeof result.token, 'string');
  assert.ok(result.token.length > 20);
  // The access token lives ACCESS_TOKEN_TTL (15 minutes by default).
  const claims = jwt.verify(result.token, config.jwtSecret) as jwt.JwtPayload;
  assert.equal(claims.sub, user._id.toString());
  assert.equal(claims.exp! - claims.iat!, 15 * 60);
  // Only the hash of the refresh token is stored.
  assert.ok(result.refreshToken.length >= 40);
  assert.equal(refreshTokens.length, 1);
  assert.notEqual(refreshTokens[0].tokenHash, result.refreshToken);
  assert.match(refreshTokens[0].tokenHash, /^[0-9a-f]{64}$/);
});

test('AuthFlow.login rejects invalid credentials', async (t) => {
  const authFlow = new AuthFlow();
  const user = {
    _id: new Types.ObjectId(),
    email: 'user@example.com',
    passwordHash: 'stored-hash',
  };

  stub(t, UserModel as unknown as Record<string, unknown>, 'findOne', async () => user);
  stub(t, bcrypt as unknown as Record<string, unknown>, 'compare', async () => false);

  await assert.rejects(
    () =>
      authFlow.login({
        email: 'user@example.com',
        password: 'secret',
      } as any),
    /Invalid credentials/
  );
});
