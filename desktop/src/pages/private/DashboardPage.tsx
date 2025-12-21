import { useServerInfoQuery } from '../../graphql/queries/generated/serverInfo';

type DashboardPageProps = {
  onLogout: () => void;
};

const widgets = [
  {
    title: 'Статус системи',
    description: 'Усі модулі працюють стабільно. Додайте сюди свої показники.',
  },
  {
    title: 'Останні зміни',
    description: 'Опишіть недавні оновлення продукту або активність користувачів.',
  },
  {
    title: 'Наступні кроки',
    description: 'Сформулюйте задачі та посилання на розділи, що важливі команді.',
  },
];

export function DashboardPage({ onLogout }: DashboardPageProps) {
  const { data, loading, error } = useServerInfoQuery({
    fetchPolicy: 'network-only',
  });

  return (
    <main className="page">
      <section className="panel dashboard">
        <div className="panel-header">
          <p className="badge">Авторизований доступ</p>
          <h1>Робоча панель</h1>
          <p className="subtitle">
            Тут будуть розділи, доступні лише авторизованим користувачам.
            Замініть віджети на реальні дані або додайте нові сторінки.
          </p>
        </div>

        <div className="widgets">
          <article className="card widget">
            <h3>GraphQL підключення</h3>
            {loading && <p>Завантаження...</p>}
            {error && (
              <p className="error">
                Помилка підключення: {error.message}
              </p>
            )}
            {!loading && !error && data?.serverInfo && (
              <p>
                Підключено. Версія: <strong>{data.serverInfo.version}</strong>,
                статус: <strong>{data.serverInfo.status}</strong>, аптайм:{' '}
                <strong>{data.serverInfo.uptimeSeconds}s</strong>.
              </p>
            )}
          </article>

          {widgets.map((widget) => (
            <article key={widget.title} className="card widget">
              <h3>{widget.title}</h3>
              <p>{widget.description}</p>
            </article>
          ))}
        </div>

        <div className="actions">
          <button className="btn ghost" type="button" onClick={onLogout}>
            Вийти
          </button>
        </div>
      </section>
    </main>
  );
}

export default DashboardPage;
