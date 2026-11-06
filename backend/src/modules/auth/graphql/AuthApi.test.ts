import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Types } from 'mongoose';

import {
  buildGraphqlSchema,
  createGraphqlContext,
  executeGraphql,
  toPlainValue,
} from '../../../test/graphqlTestUtils';
import { UserModel } from '../../../core/user';
import { stub } from '../../../test/testUtils';
import { AuthFlow } from '../services/AuthFlow';
import { Auth } from './Auth';

test('Auth GraphQL executes register, login and me through the schema', async (t) => {
  const schema = buildGraphqlSchema([Auth]);
  const userId = new Types.ObjectId();
  const calls: any[] = [];

  stub(
    t,
    AuthFlow.prototype as unknown as Record<string, unknown>,
    'register',
    async (input: any) => {
      calls.push(['register', input]);
      return {
        token: 'register-token',
        user: { _id: userId, email: input.email, name: input.name },
      };
    }
  );
  stub(t, AuthFlow.prototype as unknown as Record<string, unknown>, 'login', async (input: any) => {
    calls.push(['login', input]);
    return {
      token: 'login-token',
      user: { _id: userId, email: input.email, name: 'Tester' },
    };
  });
  stub(t, AuthFlow.prototype as unknown as Record<string, unknown>, 'me', async (req: any) => {
    calls.push(['me', req.headers.authorization]);
    return { _id: userId, email: 'tester@example.com', name: 'Tester' };
  });

  const registerResult = await executeGraphql(
    schema,
    `
      mutation Register($input: RegisterInput!) {
        register(input: $input) {
          token
          user {
            _id
            email
            name
          }
        }
      }
    `,
    {
      variables: {
        input: {
          email: 'new@example.com',
          password: 'secret',
          name: 'New User',
        },
      },
    }
  );
  const loginResult = await executeGraphql(
    schema,
    `
      mutation Login($input: LoginInput!) {
        login(input: $input) {
          token
          user {
            _id
            email
            name
          }
        }
      }
    `,
    {
      variables: {
        input: {
          email: 'tester@example.com',
          password: 'secret',
        },
      },
    }
  );
  const meResult = await executeGraphql(
    schema,
    `
      query Me {
        me {
          _id
          email
          name
        }
      }
    `,
    {
      context: createGraphqlContext({
        req: { headers: { authorization: 'Bearer token' } } as any,
      }),
    }
  );

  assert.equal(registerResult.errors, undefined);
  assert.deepEqual(toPlainValue(registerResult.data), {
    register: {
      token: 'register-token',
      user: {
        _id: userId.toHexString(),
        email: 'new@example.com',
        name: 'New User',
      },
    },
  });
  assert.equal(loginResult.errors, undefined);
  assert.deepEqual(toPlainValue(loginResult.data), {
    login: {
      token: 'login-token',
      user: {
        _id: userId.toHexString(),
        email: 'tester@example.com',
        name: 'Tester',
      },
    },
  });
  assert.equal(meResult.errors, undefined);
  assert.deepEqual(toPlainValue(meResult.data), {
    me: {
      _id: userId.toHexString(),
      email: 'tester@example.com',
      name: 'Tester',
    },
  });
  assert.deepEqual(toPlainValue(calls), [
    ['register', { email: 'new@example.com', password: 'secret', name: 'New User' }],
    ['login', { email: 'tester@example.com', password: 'secret' }],
    ['me', 'Bearer token'],
  ]);
});

test('Auth GraphQL exposes refreshSession and logout without an access token', async (t) => {
  const schema = buildGraphqlSchema([Auth]);
  const userId = new Types.ObjectId();
  const calls: any[] = [];

  stub(
    t,
    AuthFlow.prototype as unknown as Record<string, unknown>,
    'refreshSession',
    async (refreshToken: string) => {
      calls.push(['refreshSession', refreshToken]);
      return {
        token: 'next-access',
        refreshToken: 'next-refresh',
        user: { _id: userId, email: 'tester@example.com' },
      };
    }
  );
  stub(
    t,
    AuthFlow.prototype as unknown as Record<string, unknown>,
    'logout',
    async (refreshToken: string) => {
      calls.push(['logout', refreshToken]);
      return true;
    }
  );

  const refreshed = await executeGraphql(
    schema,
    `mutation($refreshToken: String!) {
      refreshSession(refreshToken: $refreshToken) { token refreshToken user { _id } }
    }`,
    { variables: { refreshToken: 'old-refresh' } }
  );
  const loggedOut = await executeGraphql(
    schema,
    `mutation($refreshToken: String!) { logout(refreshToken: $refreshToken) }`,
    { variables: { refreshToken: 'next-refresh' } }
  );

  assert.equal(refreshed.errors, undefined);
  assert.deepEqual(toPlainValue(refreshed.data), {
    refreshSession: {
      token: 'next-access',
      refreshToken: 'next-refresh',
      user: { _id: userId.toHexString() },
    },
  });
  assert.deepEqual(toPlainValue(loggedOut.data), { logout: true });
  assert.deepEqual(calls, [
    ['refreshSession', 'old-refresh'],
    ['logout', 'next-refresh'],
  ]);
});

test('Auth GraphQL reports authentication failures with the UNAUTHENTICATED code', async () => {
  const schema = buildGraphqlSchema([Auth]);

  const result = await executeGraphql(schema, 'query { me { _id } }');

  assert.equal(result.errors?.[0]?.message, 'Not authenticated');
  assert.equal(result.errors?.[0]?.extensions?.code, 'UNAUTHENTICATED');
});

test('Auth GraphQL reports a failed login with the INVALID_CREDENTIALS code', async (t) => {
  const schema = buildGraphqlSchema([Auth]);
  stub(t, UserModel as unknown as Record<string, unknown>, 'findOne', async () => null);

  const result = await executeGraphql(
    schema,
    `mutation { login(input: { email: "nobody@example.com", password: "secret" }) { token } }`
  );

  assert.equal(result.errors?.[0]?.message, 'Invalid credentials');
  // Not UNAUTHENTICATED: a wrong password must not make the client refresh a session.
  assert.equal(result.errors?.[0]?.extensions?.code, 'INVALID_CREDENTIALS');
});
