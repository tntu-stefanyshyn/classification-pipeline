import { Link } from 'react-router-dom';
import type { FC } from 'react';
import { LoginForm } from '../../auth/LoginForm';
import type { LoginPageProps } from './LoginPage.types';

const LoginPage: FC<LoginPageProps> = ({ onLoginSuccess }) => {
  return (
    <main className="page unauth">
      <div className="auth-form-panel">
        <div className="card auth-card">
          <h1>Увійдіть</h1>
          <p className="subtitle">Введіть свої дані, щоб продовжити.</p>

          <LoginForm onSuccess={onLoginSuccess} />

          <div className="auth-footer">
            <span className="muted">Немає облікового запису?</span>{' '}
            <Link to="/register" className="link">
              Зареєструватися
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
};

export default LoginPage;
