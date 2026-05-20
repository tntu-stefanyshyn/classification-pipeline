import { Link } from 'react-router-dom';
import type { FC } from 'react';
import { RegisterForm } from '../../auth/RegisterForm';
import type { RegisterPageProps } from './RegisterPage.types';
import { useI18n } from '../../../i18n';

const RegisterPage: FC<RegisterPageProps> = ({ onRegisterSuccess }) => {
  const { messages } = useI18n();

  return (
    <main className="page unauth">
      <div className="auth-form-panel">
        <div className="card auth-card">
          <h1>{messages.auth.registerPage.title}</h1>
          <p className="subtitle">{messages.auth.registerPage.subtitle}</p>

          <RegisterForm onSuccess={onRegisterSuccess} />

          <div className="auth-footer">
            <span className="muted">{messages.auth.registerPage.haveAccount}</span>{' '}
            <Link to="/login" className="link">
              {messages.auth.registerPage.login}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
};

export default RegisterPage;
