import { RegisterPage as RegisterPageView } from '../../../components/pages/RegisterPage/RegisterPage';
import type { RegisterPageProps } from '../../../components/pages/RegisterPage/RegisterPage.types';

export function RegisterPage(props: RegisterPageProps) {
  return <RegisterPageView {...props} />;
}

export default RegisterPage;
