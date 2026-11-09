import type { AuthSession } from '../../../services/tokenService';

export type RegisterPageProps = {
  onRegisterSuccess: (session: AuthSession) => void;
};
