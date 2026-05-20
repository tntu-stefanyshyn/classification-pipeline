import type { ApolloError } from '@apollo/client';
import type { GraphQLFormattedError } from 'graphql';
import type { FormikHelpers } from 'formik';
import { getMessages, localeService } from '../i18n';

const getErrorMessages = () => {
  const messages = getMessages(localeService.getLocale());
  return {
    BAD_USER_INPUT: messages.errors.badUserInput,
  } as Record<string, string>;
};

export function translateGraphQLError(err?: GraphQLFormattedError) {
  if (!err) return null;
  const message = err.message;
  const localizedMessages = getErrorMessages();
  if (message && localizedMessages[message]) {
    return localizedMessages[message];
  }
  return message;
}

function translateNetworkError(err?: ApolloError['networkError']) {
  if (!err) return null;
  return getMessages(localeService.getLocale()).errors.network;
}

export function getErrorMessage(
  graphQLErrors?: readonly GraphQLFormattedError[],
  networkError?: ApolloError['networkError']
) {
  const gqlMessage = translateGraphQLError(graphQLErrors?.[0]);
  const netMessage = translateNetworkError(networkError);
  return gqlMessage || netMessage || getMessages(localeService.getLocale()).errors.generic;
}

export function setFormikFormErrorFromApollo<T>(
  error: ApolloError,
  setFieldError: FormikHelpers<T>['setFieldError']
) {
  const message = getErrorMessage(error.graphQLErrors, error.networkError);
  setFieldError('form', message);
}
