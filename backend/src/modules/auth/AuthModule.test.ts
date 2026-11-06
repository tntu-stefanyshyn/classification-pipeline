import assert from 'node:assert/strict';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

import { config } from '../../config/config';
import { User } from '../../core/user';
import { UserModel } from '../../core/user/models/UserModel';
import { stub } from '../../test/testUtils';
import { Auth } from './graphql/Auth';
import { AuthPayload } from './classes/AuthPayload';
import { LoginInput } from './classes/LoginInput';
import { RegisterInput } from './classes/RegisterInput';
import { AuthFlow } from './services/AuthFlow';
import {
  accessTokenTtlSeconds,
  durationToSeconds,
  refreshTokenTtlSeconds,
} from './constants/token';
import { AuthenticationError } from './classes/AuthenticationError';
import { UNAUTHENTICATED } from './constants/errorCodes';
import { reportAuthenticationErrors } from './graphql/reportAuthenticationErrors';

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

test('AuthFlow.me requires authentication even when development mode is enabled', async (t) => {
  const authFlow = new AuthFlow();
  const originalIsDev = config.isDev;

  t.after(() => {
    (config as any).isDev = originalIsDev;
  });
  (config as any).isDev = true;

  await assert.rejects(() => authFlow.me({ headers: {} } as any), /Not authenticated/);
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

test('AuthFlow.isService accepts only the configured service token', (t) => {
  const original = config.backend.serviceToken;
  t.after(() => {
    config.backend.serviceToken = original;
  });
  const flow = new AuthFlow();
  const req = (authorization?: string) => ({ headers: { authorization } }) as any;

  config.backend.serviceToken = 'svc-token';
  assert.equal(flow.isService(req('Bearer svc-token')), true);
  assert.equal(flow.isService(req('Bearer svc-other')), false);
  assert.equal(flow.isService(req('Bearer svc')), false);
  assert.equal(flow.isService(req()), false);
  assert.equal(flow.isService({} as any), false);

  config.backend.serviceToken = '';
  assert.equal(flow.isService(req('Bearer ')), false);
});

test('AuthFlow.requireService rejects anything except the service token', (t) => {
  const original = config.backend.serviceToken;
  t.after(() => {
    config.backend.serviceToken = original;
  });
  const flow = new AuthFlow();
  const req = (authorization?: string) => ({ headers: { authorization } }) as any;

  config.backend.serviceToken = 'svc-token';
  assert.doesNotThrow(() => flow.requireService(req('Bearer svc-token')));
  assert.throws(() => flow.requireService(req('Bearer user-jwt')), /Not authenticated/);
  assert.throws(() => flow.requireService(req()), /Not authenticated/);
});

test('durationToSeconds accepts seconds and s, m, h, d units', () => {
  assert.equal(durationToSeconds('900'), 900);
  assert.equal(durationToSeconds('15m'), 900);
  assert.equal(durationToSeconds(' 12h '), 43200);
  assert.equal(durationToSeconds('30D'), 2592000);
  for (const invalid of ['', '0', '-5m', '1.5h', '10w', 'soon']) {
    assert.throws(() => durationToSeconds(invalid), /Invalid duration/);
  }
});

test('token lifetimes come from ACCESS_TOKEN_TTL and REFRESH_TOKEN_TTL', (t) => {
  const original = { ...config.auth };
  t.after(() => {
    Object.assign(config.auth, original);
  });

  assert.equal(accessTokenTtlSeconds(), 15 * 60);
  assert.equal(refreshTokenTtlSeconds(), 30 * 86400);
  config.auth.accessTokenTtl = '5m';
  config.auth.refreshTokenTtl = '7d';
  assert.equal(accessTokenTtlSeconds(), 300);
  assert.equal(refreshTokenTtlSeconds(), 7 * 86400);
});

test('every AuthFlow authentication failure is an AuthenticationError', async (t) => {
  const original = config.backend.serviceToken;
  t.after(() => {
    config.backend.serviceToken = original;
  });
  config.backend.serviceToken = 'svc-token';
  const flow = new AuthFlow();
  const req = (authorization?: string) => ({ headers: { authorization } }) as any;
  const expectCode = (message: RegExp) => (error: unknown) => {
    // A plain domain error: the GraphQL layer adds the code (see the next test).
    assert.ok(error instanceof AuthenticationError);
    assert.match(error.message, message);
    return true;
  };

  await assert.rejects(() => flow.me(req()), expectCode(/^Not authenticated$/));
  await assert.rejects(() => flow.me(req('Bearer garbage')), expectCode(/jwt malformed/));
  const expired = jwt.sign({ sub: new Types.ObjectId().toString() }, config.jwtSecret, {
    expiresIn: -10,
  });
  await assert.rejects(() => flow.me(req(`Bearer ${expired}`)), expectCode(/jwt expired/));
  const withoutSubject = jwt.sign({ email: 'user@example.com' }, config.jwtSecret);
  await assert.rejects(
    () => flow.me(req(`Bearer ${withoutSubject}`)),
    expectCode(/Invalid token payload/)
  );
  stub(t, UserModel as unknown as Record<string, unknown>, 'findById', async () => null);
  const forDeletedUser = jwt.sign({ sub: new Types.ObjectId().toString() }, config.jwtSecret);
  await assert.rejects(
    () => flow.me(req(`Bearer ${forDeletedUser}`)),
    expectCode(/User not found/)
  );
  assert.throws(() => flow.requireService(req('Bearer user-jwt')), expectCode(/Not authenticated/));
});

test('a 7-day token issued before this change keeps working until it expires', async (t) => {
  const flow = new AuthFlow();
  const user = { _id: new Types.ObjectId(), email: 'user@example.com' };
  stub(t, UserModel as unknown as Record<string, unknown>, 'findById', async () => user);
  const legacy = jwt.sign({ sub: user._id.toString(), email: user.email }, config.jwtSecret, {
    expiresIn: '7d',
  });

  assert.equal(await flow.me({ headers: { authorization: `Bearer ${legacy}` } } as any), user);
});

test('reportAuthenticationErrors adds the UNAUTHENTICATED code and passes other errors on', async () => {
  const run = (error: Error) =>
    reportAuthenticationErrors({} as any, async () => {
      throw error;
    });

  await assert.rejects(run(new AuthenticationError('jwt expired')), (error: any) => {
    assert.equal(error.message, 'jwt expired');
    assert.equal(error.extensions?.code, UNAUTHENTICATED);
    assert.ok(error.originalError instanceof AuthenticationError);
    return true;
  });
  const other = new Error('Експеремент не знайдено');
  await assert.rejects(run(other), (error) => error === other);
  assert.equal(await reportAuthenticationErrors({} as any, async () => 'value'), 'value');
});

test('AuthFlow.authenticate returns the service or the user of the request', async (t) => {
  const original = config.backend.serviceToken;
  t.after(() => {
    config.backend.serviceToken = original;
  });
  config.backend.serviceToken = 'svc-token';
  const flow = new AuthFlow();
  const user = { _id: new Types.ObjectId(), email: 'user@example.com' };
  stub(t, AuthFlow.prototype as unknown as Record<string, unknown>, 'me', async () => user);

  assert.deepEqual(
    await flow.authenticate({ headers: { authorization: 'Bearer svc-token' } } as any),
    {
      kind: 'service',
    }
  );
  assert.deepEqual(
    await flow.authenticate({ headers: { authorization: 'Bearer user-jwt' } } as any),
    {
      kind: 'user',
      userId: user._id,
    }
  );
});

test('AuthFlow.authenticate rejects a request without credentials', async () => {
  await assert.rejects(
    () => new AuthFlow().authenticate({ headers: {} } as any),
    (error: unknown) =>
      error instanceof AuthenticationError && error.message === 'Not authenticated'
  );
});
