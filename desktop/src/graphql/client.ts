/* eslint-disable @typescript-eslint/no-explicit-any */
import { ApolloClient, HttpLink, InMemoryCache, from } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import { tokenService } from '../services/tokenService';
import { config } from '../config/config';
import { translateGraphQLError } from '../utils/formError';

const httpLink = new HttpLink({ uri: config.renderer.graphqlEndpoint });

const authLink = setContext((_, { headers }) => {
  const token = tokenService.getToken();
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : '',
    },
  };
});

const errorLink = onError(({ graphQLErrors = [], networkError = [] }) => {
  const errors = [graphQLErrors, networkError].flat();
  errors.forEach((err) => {
    if (!err) return;
    const originalMessage = err?.message;
    (err as any).originalMessage = originalMessage;
    (err as any).message = translateGraphQLError(err);
  });
});

export const apolloClient = new ApolloClient({
  link: from([errorLink, authLink, httpLink]),
  cache: new InMemoryCache(),
});

export default apolloClient;
