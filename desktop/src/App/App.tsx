import 'reactflow/dist/style.css';
import 'react-toastify/dist/ReactToastify.css';
import '../index.css';
import { ApolloProvider } from '@apollo/client/react';
import type { FC } from 'react';
import { AppRouter } from '../router/AppRouter';
import { apolloClient } from '../graphql/client';
import { tokenService, useAuthToken } from '../services/tokenService';
import { ToastContainer } from 'react-toastify';

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
      <ToastContainer position="top-right" />
    </ApolloProvider>
  );
};

export default App;
