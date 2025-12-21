import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { DashboardPage } from '../pages/private/DashboardPage';
import { WelcomePage } from '../pages/public/WelcomePage';

type AppRouterProps = {
  isAuthenticated: boolean;
  onLoginSuccess: (token: string) => void;
  onLogout: () => void;
};

export function AppRouter({
  isAuthenticated,
  onLoginSuccess,
  onLogout,
}: AppRouterProps) {
  return (
    <HashRouter>
      <Routes>
        <Route
          path="/welcome"
          element={<WelcomePage onLoginSuccess={onLoginSuccess} />}
        />
        <Route
          path="/app"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <DashboardPage onLogout={onLogout} />
            </ProtectedRoute>
          }
        />
        <Route
          path="*"
          element={
            <Navigate
              to={isAuthenticated ? '/app' : '/welcome'}
              replace
            />
          }
        />
      </Routes>
    </HashRouter>
  );
}

export default AppRouter;
