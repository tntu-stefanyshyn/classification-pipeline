import 'reactflow/dist/style.css';
import 'react-toastify/dist/ReactToastify.css';
import '../index.css';
import { ApolloProvider } from '@apollo/client/react';
import { useEffect, type FC } from 'react';
import { AppRouter } from '../router/AppRouter';
import { apolloClient } from '../graphql/client';
import { tokenService, useAuthToken } from '../services/tokenService';
import { ToastContainer } from 'react-toastify';
import { useI18n } from '../i18n';

const App: FC = () => {
  const token = useAuthToken();
  const { messages } = useI18n();
  const isAuthenticated = Boolean(token);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = messages.app.name;
    }
  }, [messages.app.name]);

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
