import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLoginMutation } from '../../graphql/mutations/generated/login';

type WelcomePageProps = {
  onLoginSuccess: (token: string) => void;
};

const features = [
  {
    title: 'Миттєвий старт',
    description:
      'Запускайте застосунок за секунди завдяки Vite та швидкій збірці.',
  },
  {
    title: 'Готовий до роботи',
    description:
      'Electron забезпечує кросплатформність, а React — гнучкий інтерфейс.',
  },
  {
    title: 'Дружній до розробника',
    description:
      'Підтримка TypeScript, гаряче оновлення та зручний доступ до DevTools.',
  },
];

export function WelcomePage({ onLoginSuccess }: WelcomePageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();
  const [loginMutation, { loading, error }] = useLoginMutation();

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();

    const result = await loginMutation({
      variables: { email, password },
    });

    const token = result.data?.login.token;
    if (token) {
      onLoginSuccess(token);
      navigate('/app', { replace: true });
    }
  };

  return (
    <main className="page">
      <header className="hero">
        <p className="badge">New • Electron + React</p>
        <h1>Вітаємо у десктопному застосунку</h1>
        <p className="subtitle">
          Це стартова сторінка на React. Використовуйте її як основу для вашого
          інтерфейсу, додавайте компоненти та інтегруйте бізнес-логіку.
        </p>
        <div className="actions">
          <form className="card" onSubmit={handleLogin}>
            <h3>Увійти</h3>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="user@example.com"
              />
            </div>
            <div className="form-group">
              <label htmlFor="password">Пароль</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="••••••••"
              />
            </div>
            {error && <p className="error">Помилка: {error.message}</p>}
            <button className="btn primary" type="submit" disabled={loading}>
              {loading ? 'Вхід...' : 'Увійти'}
            </button>
          </form>
          <a
            className="btn ghost"
            href="https://www.electronjs.org/"
            target="_blank"
            rel="noreferrer"
          >
            Документація
          </a>
        </div>
      </header>

      <section className="panel">
        <h2>Що всередині</h2>
        <div className="features">
          {features.map((feature) => (
            <article key={feature.title} className="card">
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export default WelcomePage;
