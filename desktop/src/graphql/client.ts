import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { tokenService } from '../services/tokenService';
import { config } from '../config/config';

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

export const apolloClient = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache(),
});

export default apolloClient;
