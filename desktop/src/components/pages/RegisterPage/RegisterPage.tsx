import { Link } from 'react-router-dom';
import type { FC } from 'react';
import { RegisterForm } from '../../auth/RegisterForm';
import type { RegisterPageProps } from './RegisterPage.types';

const RegisterPage: FC<RegisterPageProps> = ({ onRegisterSuccess }) => {
  return (
    <main className="page unauth">
      <div className="auth-form-panel">
        <div className="card auth-card">
          <h1>Створіть обліковий запис</h1>
          <p className="subtitle">Заповніть поля, щоб розпочати роботу.</p>

          <RegisterForm onSuccess={onRegisterSuccess} />

          <div className="auth-footer">
            <span className="muted">Вже маєте обліковий запис?</span>{' '}
            <Link to="/login" className="link">
              Увійти
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
};

export default RegisterPage;
