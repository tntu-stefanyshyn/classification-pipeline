import { Link } from 'react-router-dom';
import type { FC } from 'react';
import { LoginForm } from '../../auth/LoginForm';
import type { LoginPageProps } from './LoginPage.types';
import { useI18n } from '../../../i18n';

const LoginPage: FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const { messages } = useI18n();

  return (
    <main className="page unauth">
      <div className="auth-form-panel">
        <div className="card auth-card">
          <h1>{messages.auth.loginPage.title}</h1>
          <p className="subtitle">{messages.auth.loginPage.subtitle}</p>

          <LoginForm onSuccess={onLoginSuccess} />

          <div className="auth-footer">
            <span className="muted">{messages.auth.loginPage.noAccount}</span>{' '}
            <Link to="/register" className="link">
              {messages.auth.loginPage.register}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
};

export default LoginPage;
