import type { AuthSession } from '../../services/tokenService';

export type AppRouterProps = {
  isAuthenticated: boolean;
  onLoginSuccess: (session: AuthSession) => void;
  onLogout: () => void;
};
