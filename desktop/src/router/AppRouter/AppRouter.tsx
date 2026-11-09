import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { FC } from 'react';
import { DashboardPage } from '../../pages/private/DashboardPage';
import { ExperimentsPage } from '../../pages/private/ExperimentsPage';
import { ExperimentDetailsPage } from '../../pages/private/ExperimentDetailsPage';
import { ExperimentConstructorPage } from '../../pages/private/ExperimentConstructorPage';
import { FilesPage } from '../../pages/private/FilesPage';
import { LoginPage } from '../../pages/public/LoginPage';
import { RegisterPage } from '../../pages/public/RegisterPage';
import { useMeQuery } from './graphql';
import type { AppRouterProps } from './AppRouter.types';

const AppRouter: FC<AppRouterProps> = ({ isAuthenticated, onLoginSuccess, onLogout }) => {
  const { data, loading, error } = useMeQuery({
    skip: !isAuthenticated,
    fetchPolicy: 'network-only',
  });

  // The session link clears a session that cannot be refreshed, which signs the user out. Any
  // other error (for example offline) keeps the user signed in, and the pages show it.
  const resolvedAuth = isAuthenticated && Boolean(data?.me || error);

  if (isAuthenticated && loading) {
    return null;
  }

  return (
    <HashRouter>
      <Routes>
        <Route
          path="/login"
          element={
            resolvedAuth ? (
              <Navigate to="/app" replace />
            ) : (
              <LoginPage onLoginSuccess={onLoginSuccess} />
            )
          }
        />
        <Route
          path="/register"
          element={
            resolvedAuth ? (
              <Navigate to="/app" replace />
            ) : (
              <RegisterPage onRegisterSuccess={onLoginSuccess} />
            )
          }
        />
        <Route
          path="/app"
          element={
            resolvedAuth ? <DashboardPage onLogout={onLogout} /> : <Navigate to="/login" replace />
          }
        />
        <Route
          path="/app/experiments"
          element={
            resolvedAuth ? (
              <ExperimentsPage onLogout={onLogout} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/app/files"
          element={
            resolvedAuth ? <FilesPage onLogout={onLogout} /> : <Navigate to="/login" replace />
          }
        />
        <Route
          path="/app/experiments/:id"
          element={
            resolvedAuth ? (
              <ExperimentDetailsPage onLogout={onLogout} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/app/experiments/:id/constructor"
          element={resolvedAuth ? <ExperimentConstructorPage /> : <Navigate to="/login" replace />}
        />
        <Route path="*" element={<Navigate to={resolvedAuth ? '/app' : '/login'} replace />} />
      </Routes>
    </HashRouter>
  );
};

export default AppRouter;
