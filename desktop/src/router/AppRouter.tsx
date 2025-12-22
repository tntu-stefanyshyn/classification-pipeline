import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useEffect } from 'react';
import { DashboardPage } from '../pages/private/DashboardPage';
import { ExperimentsPage } from '../pages/private/ExperimentsPage';
import { ExperimentDetailsPage } from '../pages/private/ExperimentDetailsPage';
import { FilesPage } from '../pages/private/FilesPage';
import { LoginPage } from '../pages/public/LoginPage';
import { RegisterPage } from '../pages/public/RegisterPage';
import { useMeQuery } from '../graphql/queries/generated/me';
import { tokenService } from '../services/tokenService';

type AppRouterProps = {
  isAuthenticated: boolean;
  onLoginSuccess: (token: string) => void;
  onLogout: () => void;
};

export function AppRouter({ isAuthenticated, onLoginSuccess, onLogout }: AppRouterProps) {
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
        <Route path="*" element={<Navigate to={resolvedAuth ? '/app' : '/login'} replace />} />
      </Routes>
    </HashRouter>
  );
}

export default AppRouter;
