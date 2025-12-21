import { useState } from 'react';
import './index.css';
import { AppRouter } from './router/AppRouter';
import { ApolloProvider } from '@apollo/client';
import { apolloClient } from './graphql/client';

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  return (
    <ApolloProvider client={apolloClient}>
      <AppRouter
        isAuthenticated={isAuthenticated}
        onLogin={() => setIsAuthenticated(true)}
        onLogout={() => setIsAuthenticated(false)}
      />
    </ApolloProvider>
  );
}

export default App;
