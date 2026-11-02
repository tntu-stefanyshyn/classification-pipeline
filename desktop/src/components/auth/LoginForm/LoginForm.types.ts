import type { AuthSession } from '../../../services/tokenService';

export type LoginFormProps = {
  onSuccess: (session: AuthSession) => void;
};
