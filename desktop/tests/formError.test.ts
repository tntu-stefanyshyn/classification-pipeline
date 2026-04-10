import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  getErrorMessage,
  setFormikFormErrorFromApollo,
  translateGraphQLError,
} from '../src/utils/formError';

test('translateGraphQLError maps known backend codes and preserves unknown text', () => {
  assert.equal(
    translateGraphQLError({ message: 'BAD_USER_INPUT' } as any),
    'Перевірте введені дані.'
  );
  assert.equal(translateGraphQLError({ message: 'Custom message' } as any), 'Custom message');
  assert.equal(translateGraphQLError(undefined), null);
});

test('getErrorMessage prefers graphQL errors, then network errors, then fallback', () => {
  assert.equal(
    getErrorMessage([{ message: 'BAD_USER_INPUT' } as any], { name: 'NetworkError' } as any),
    'Перевірте введені дані.'
  );
  assert.equal(
    getErrorMessage(undefined, { name: 'NetworkError' } as any),
    'Немає звʼязку з сервером. Спробуйте пізніше.'
  );
  assert.equal(getErrorMessage(), 'Сталася помилка. Спробуйте ще раз.');
});

test('setFormikFormErrorFromApollo writes translated form-level error', () => {
  const calls: Array<[string, string]> = [];

  setFormikFormErrorFromApollo(
    {
      graphQLErrors: [{ message: 'BAD_USER_INPUT' }],
      networkError: null,
    } as any,
    ((field: string, message: string) => {
      calls.push([field, String(message)]);
    }) as any
  );

  assert.deepEqual(calls, [['form', 'Перевірте введені дані.']]);
});
