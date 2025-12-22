import type { ApolloError } from '@apollo/client';
import type { GraphQLFormattedError } from 'graphql';
import type { FormikHelpers } from 'formik';

export const ERROR_MESSAGES: Record<string, string> = {
  BAD_USER_INPUT: 'Перевірте введені дані.',
};

export function translateGraphQLError(err?: GraphQLFormattedError) {
  if (!err) return null;
  const message = err.message;
  if (message && ERROR_MESSAGES[message]) {
    return ERROR_MESSAGES[message];
  }
  return message;
}

function translateNetworkError(err?: ApolloError['networkError']) {
  if (!err) return null;
  return 'Немає звʼязку з сервером. Спробуйте пізніше.';
}

export function getErrorMessage(
  graphQLErrors?: readonly GraphQLFormattedError[],
  networkError?: ApolloError['networkError']
) {
  const gqlMessage = translateGraphQLError(graphQLErrors?.[0]);
  const netMessage = translateNetworkError(networkError);
  return gqlMessage || netMessage || 'Сталася помилка. Спробуйте ще раз.';
}

export function setFormikFormErrorFromApollo<T>(
  error: ApolloError,
  setFieldError: FormikHelpers<T>['setFieldError']
) {
  const message = getErrorMessage(error.graphQLErrors, error.networkError);
  setFieldError('form', message);
}
