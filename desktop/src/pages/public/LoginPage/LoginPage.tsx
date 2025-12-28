import { LoginPage as LoginPageView } from '../../../components/pages/LoginPage/LoginPage';
import type { LoginPageProps } from '../../../components/pages/LoginPage/LoginPage.types';

export function LoginPage(props: LoginPageProps) {
  return <LoginPageView {...props} />;
}

export default LoginPage;
