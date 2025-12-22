import { Navigate } from 'react-router-dom';
import type { ReactElement } from 'react';
import { tokenService } from '../services/tokenService';
import { useMeQuery } from '../graphql/queries/generated/me';

type ProtectedRouteProps = {
  isAuthenticated: boolean;
  children: ReactElement;
  redirectTo?: string;
};

export function ProtectedRoute({
  isAuthenticated,
  children,
  redirectTo = '/login',
}: ProtectedRouteProps) {
  const hasToken = isAuthenticated || Boolean(tokenService.getToken());
  const { data, loading, error } = useMeQuery({
    skip: !hasToken,
    fetchPolicy: 'network-only',
  });

  if (!hasToken) {
    return <Navigate to={redirectTo} replace />;
  }

  if (loading) {
    return null;
  }

  if (error || !data?.me) {
    tokenService.clearToken();
    return <Navigate to={redirectTo} replace />;
  }

  return children;
}

export default ProtectedRoute;
