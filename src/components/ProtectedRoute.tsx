import { Navigate } from 'react-router-dom';
import type { ReactElement } from 'react';

type ProtectedRouteProps = {
  isAuthenticated: boolean;
  children: ReactElement;
  redirectTo?: string;
};

export function ProtectedRoute({
  isAuthenticated,
  children,
  redirectTo = '/welcome',
}: ProtectedRouteProps) {
  if (!isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  return children;
}

export default ProtectedRoute;
