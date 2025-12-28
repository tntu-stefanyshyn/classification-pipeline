import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useEffect, type FC } from 'react';
import { DashboardPage } from '../../pages/private/DashboardPage';
import { ExperimentsPage } from '../../pages/private/ExperimentsPage';
import { ExperimentDetailsPage } from '../../pages/private/ExperimentDetailsPage';
import { ExperimentConstructorPage } from '../../pages/private/ExperimentConstructorPage';
import { FilesPage } from '../../pages/private/FilesPage';
import { LoginPage } from '../../pages/public/LoginPage';
import { RegisterPage } from '../../pages/public/RegisterPage';
import { tokenService } from '../../services/tokenService';
import { useMeQuery } from './graphql';
import type { AppRouterProps } from './AppRouter.types';

const AppRouter: FC<AppRouterProps> = ({ isAuthenticated, onLoginSuccess, onLogout }) => {
  const { data, loading, error } = useMeQuery({
    skip: !isAuthenticated,
    fetchPolicy: 'network-only',
  });

  useEffect(() => {
    if (error) {
      tokenService.clearToken();
    }
  }, [error]);

  const resolvedAuth = isAuthenticated && Boolean(data?.me);

  if (isAuthenticated && loading) {
    return null;
  }

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage onLoginSuccess={onLoginSuccess} />} />
        <Route path="/register" element={<RegisterPage onRegisterSuccess={onLoginSuccess} />} />
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
