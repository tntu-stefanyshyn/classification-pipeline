import 'reactflow/dist/style.css';
import 'react-toastify/dist/ReactToastify.css';
import '../index.css';
import { ApolloProvider } from '@apollo/client/react';
import { useEffect, type FC } from 'react';
import { AppRouter } from '../router/AppRouter';
import { apolloClient } from '../graphql/client';
import { tokenService, useAuthToken } from '../services/tokenService';
import { endSession, revokePendingLogouts } from '../graphql/session';
import { ToastContainer, toast } from 'react-toastify';
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

  // Sign-outs the backend has not confirmed are repeated at start and when the network is back.
  useEffect(() => {
    const retry = () => void revokePendingLogouts();
    retry();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, []);

  const logout = async () => {
    if (!(await endSession())) toast.warn(messages.errors.logoutPending);
  };

  return (
    <ApolloProvider client={apolloClient}>
      <AppRouter
        isAuthenticated={isAuthenticated}
        onLoginSuccess={(session) => tokenService.setSession(session)}
        onLogout={() => void logout()}
      />
      <ToastContainer position="top-right" />
    </ApolloProvider>
  );
};

export default App;
