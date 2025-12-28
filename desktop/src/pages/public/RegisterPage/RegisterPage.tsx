import type { FC } from 'react';
import {
  RegisterPage as RegisterPageView,
  type RegisterPageProps,
} from '../../../components/pages/RegisterPage';

const RegisterPage: FC<RegisterPageProps> = (props) => {
  return <RegisterPageView {...props} />;
};

export default RegisterPage;
