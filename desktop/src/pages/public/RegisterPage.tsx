import { Link } from 'react-router-dom';
import RegisterForm from '../../components/auth/RegisterForm';

type RegisterPageProps = {
  onRegisterSuccess: (token: string) => void;
};

export function RegisterPage({ onRegisterSuccess }: RegisterPageProps) {
  return (
    <main className="page unauth">
      <div className="auth-form-panel">
        <div className="card auth-card">
          <h1>Створіть акаунт</h1>
          <p className="subtitle">Заповніть поля, щоб розпочати роботу.</p>

          <RegisterForm onSuccess={onRegisterSuccess} />

          <div className="auth-footer">
            <span className="muted">Вже є акаунт?</span>{' '}
            <Link to="/login" className="link">
              Увійти
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

export default RegisterPage;
