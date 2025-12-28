import type { FC } from 'react';
import {
  LoginPage as LoginPageView,
  type LoginPageProps,
} from '../../../components/pages/LoginPage';

const LoginPage: FC<LoginPageProps> = (props) => {
  return <LoginPageView {...props} />;
};

export default LoginPage;
