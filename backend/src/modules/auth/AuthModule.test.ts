import assert from 'node:assert/strict';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

import { config } from '../../config/config';
import { User } from '../../core/user';
import { UserModel } from '../../core/user/models/UserModel';
import { stub, createLeanResult } from '../../test/testUtils';
import { Auth } from './graphql/Auth';
import { AuthPayload } from './classes/AuthPayload';
import { LoginInput } from './classes/LoginInput';
import { RegisterInput } from './classes/RegisterInput';
import { AuthFlow } from './services/AuthFlow';

test('auth classes store assigned values and resolver delegates to AuthFlow', async (t) => {
  const payload = new AuthPayload();
  const loginInput = new LoginInput();
  const registerInput = new RegisterInput();
  const resolver = new Auth();
  const user = { _id: new Types.ObjectId(), email: 'user@example.com' } as User;
  const registerCalls: any[] = [];
  const loginCalls: any[] = [];
  const meCalls: any[] = [];

  payload.token = 'token';
  payload.user = user;
  loginInput.email = 'user@example.com';
  loginInput.password = 'secret';
  registerInput.email = 'new@example.com';
  registerInput.password = 'secret';
  registerInput.name = 'Ivan';

  stub(
    t,
    AuthFlow.prototype as unknown as Record<string, unknown>,
    'register',
    async (input: any) => {
      registerCalls.push(input);
      return payload;
    }
  );
  stub(t, AuthFlow.prototype as unknown as Record<string, unknown>, 'login', async (input: any) => {
    loginCalls.push(input);
    return payload;
  });
  stub(t, AuthFlow.prototype as unknown as Record<string, unknown>, 'me', async (req: any) => {
    meCalls.push(req);
    return user;
  });

  assert.equal(await resolver.register(registerInput), payload);
  assert.equal(await resolver.login(loginInput), payload);
  assert.equal(await resolver.me({ headers: {} } as any), user);
  assert.deepEqual(registerCalls, [registerInput]);
  assert.deepEqual(loginCalls, [loginInput]);
  assert.deepEqual(meCalls, [{ headers: {} }]);
});

test('AuthFlow.me returns seeded dev user when development mode is enabled', async (t) => {
  const authFlow = new AuthFlow();
  const originalIsDev = config.isDev;
  const devUser = { _id: new Types.ObjectId(), email: 'dev@example.com' };

  t.after(() => {
    (config as any).isDev = originalIsDev;
  });
  (config as any).isDev = true;

  stub(t, UserModel as unknown as Record<string, unknown>, 'findOne', (query: any) => {
    assert.deepEqual(query, {
      email: 'ivan_stefanyshyn0707@tntu.edu.ua',
    });
    return createLeanResult(devUser);
  });

  const result = await authFlow.me({ headers: {} } as any);

  assert.equal(result, devUser);
});

test('AuthFlow.me verifies bearer token and loads the user', async (t) => {
  const authFlow = new AuthFlow();
  const originalIsDev = config.isDev;
  const originalJwtSecret = config.jwtSecret;
  const user = { _id: new Types.ObjectId(), email: 'user@example.com' };

  t.after(() => {
    (config as any).isDev = originalIsDev;
    (config as any).jwtSecret = originalJwtSecret;
  });
  (config as any).isDev = false;
  (config as any).jwtSecret = 'jwt-secret';

  stub(t, jwt as unknown as Record<string, unknown>, 'verify', (token: string, secret: string) => {
    assert.equal(token, 'signed-token');
    assert.equal(secret, 'jwt-secret');
    return { sub: user._id.toString() };
  });
  stub(t, UserModel as unknown as Record<string, unknown>, 'findById', async (id: string) => {
    assert.equal(id, user._id.toString());
    return user;
  });

  const result = await authFlow.me({
    headers: { authorization: 'Bearer signed-token' },
  } as any);

  assert.equal(result, user);
});

test('AuthFlow.me rejects missing authentication headers outside development', async (t) => {
  const authFlow = new AuthFlow();
  const originalIsDev = config.isDev;

  t.after(() => {
    (config as any).isDev = originalIsDev;
  });
  (config as any).isDev = false;

  await assert.rejects(() => authFlow.me({ headers: {} } as any), /Not authenticated/);
});
