import 'reactflow/dist/style.css';
import '../index.css';
import { ApolloProvider } from '@apollo/client/react';
import { AppRouter } from '../router/AppRouter/AppRouter';
import { apolloClient } from '../graphql/client';
import { tokenService, useAuthToken } from '../services/tokenService';

export function App() {
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
}

export default App;
