/* eslint-disable @typescript-eslint/no-explicit-any */
import { ApolloClient, HttpLink, InMemoryCache, from } from '@apollo/client';
import { onError } from '@apollo/client/link/error';
import { tokenService } from '../services/tokenService';
import { config } from '../config/config';
import { translateGraphQLError } from '../utils/formError';
import { createAuthLink, createSessionLink } from './sessionLink';

const httpLink = new HttpLink({ uri: config.renderer.graphqlEndpoint });

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
  link: from([errorLink, createSessionLink(), createAuthLink(tokenService), httpLink]),
  cache: new InMemoryCache(),
});

// After a sign-out or an expired session the cache must not keep the previous user's data.
tokenService.subscribe((token) => {
  if (!token) void apolloClient.clearStore();
});

export default apolloClient;
