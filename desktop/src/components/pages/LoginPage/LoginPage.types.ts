import type { AuthSession } from '../../../services/tokenService';

export type LoginPageProps = {
  onLoginSuccess: (session: AuthSession) => void;
};
