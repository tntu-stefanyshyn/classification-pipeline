import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { DashboardPage } from '../pages/private/DashboardPage';
import { LoginPage } from '../pages/public/LoginPage';
import { RegisterPage } from '../pages/public/RegisterPage';

type AppRouterProps = {
  isAuthenticated: boolean;
  onLoginSuccess: (token: string) => void;
  onLogout: () => void;
};

export function AppRouter({ isAuthenticated, onLoginSuccess, onLogout }: AppRouterProps) {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage onLoginSuccess={onLoginSuccess} />} />
        <Route path="/register" element={<RegisterPage onRegisterSuccess={onLoginSuccess} />} />
        <Route
          path="/app"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <DashboardPage onLogout={onLogout} />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to={isAuthenticated ? '/app' : '/login'} replace />} />
      </Routes>
    </HashRouter>
  );
}

export default AppRouter;
