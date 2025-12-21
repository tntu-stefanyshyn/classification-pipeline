import { useEffect, useState } from 'react';
import './index.css';
import { AppRouter } from './router/AppRouter';
import { ApolloProvider } from '@apollo/client/react';
import { apolloClient } from './graphql/client';

export function App() {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem('auth_token'),
  );
  const isAuthenticated = Boolean(token);

  useEffect(() => {
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  }, [token]);

  return (
    <ApolloProvider client={apolloClient}>
      <AppRouter
        isAuthenticated={isAuthenticated}
        onLoginSuccess={(nextToken) => setToken(nextToken)}
        onLogout={() => setToken(null)}
      />
    </ApolloProvider>
  );
}

export default App;
