import assert from 'node:assert/strict';
import { test } from 'node:test';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';

import { UserModel } from '../../../core/user';
import { stub } from '../../../test/testUtils';
import { AuthFlow } from './AuthFlow';

test('AuthFlow.register normalizes user data and returns a token', async (t) => {
  const authFlow = new AuthFlow();
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

test('AuthFlow.login returns a token for valid credentials', async (t) => {
  const authFlow = new AuthFlow();
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
