import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Types } from 'mongoose';

import {
  buildGraphqlSchema,
  createGraphqlContext,
  executeGraphql,
  toPlainValue,
} from '../../../test/graphqlTestUtils';
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
