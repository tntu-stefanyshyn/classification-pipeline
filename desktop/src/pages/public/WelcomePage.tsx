import { useNavigate } from 'react-router-dom';

type WelcomePageProps = {
  onLogin: () => void;
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

export function WelcomePage({ onLogin }: WelcomePageProps) {
  const navigate = useNavigate();

  const handleLogin = () => {
    onLogin();
    navigate('/app', { replace: true });
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
          <button className="btn primary" type="button" onClick={handleLogin}>
            Увійти як демо
          </button>
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
