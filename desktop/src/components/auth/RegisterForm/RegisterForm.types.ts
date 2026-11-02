import type { AuthSession } from '../../../services/tokenService';

export type RegisterFormProps = {
  onSuccess: (session: AuthSession) => void;
};
