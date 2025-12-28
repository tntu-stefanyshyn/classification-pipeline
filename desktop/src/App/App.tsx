import 'reactflow/dist/style.css';
import '../index.css';
import { ApolloProvider } from '@apollo/client/react';
import type { FC } from 'react';
import { AppRouter } from '../router/AppRouter';
import { apolloClient } from '../graphql/client';
import { tokenService, useAuthToken } from '../services/tokenService';

const App: FC = () => {
  const token = useAuthToken();
  const isAuthenticated = Boolean(token);

  return (
    <ApolloProvider client={apolloClient}>
      <AppRouter
        isAuthenticated={isAuthenticated}
        onLoginSuccess={(nextToken) => tokenService.setToken(nextToken)}
        onLogout={() => tokenService.clearToken()}
      />
    </ApolloProvider>
  );
};

export default App;
