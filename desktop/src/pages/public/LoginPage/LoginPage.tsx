import { Link } from 'react-router-dom';
import LoginForm from '../../../components/auth/LoginForm/LoginForm';
import type { LoginPageProps } from './LoginPage.types';

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  return (
    <main className="page unauth">
      <div className="auth-form-panel">
        <div className="card auth-card">
          <h1>Увійдіть</h1>
          <p className="subtitle">Введіть свої дані, щоб продовжити.</p>

          <LoginForm onSuccess={onLoginSuccess} />

          <div className="auth-footer">
            <span className="muted">Немає акаунта?</span>{' '}
            <Link to="/register" className="link">
              Зареєструватися
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

export default LoginPage;
