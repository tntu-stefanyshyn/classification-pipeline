type DashboardPageProps = {
  onLogout: () => void;
};

const widgets = [
  {
    title: 'Статус',
    description: 'Усі системи працюють стабільно.',
  },
  {
    title: 'Останні зміни',
    description: 'Додайте тут оновлення продукту або активність користувача.',
  },
  {
    title: 'Наступні кроки',
    description: 'Сформулюйте задачі чи посилання на розділи, що важливі.',
  },
];

export function DashboardPage({ onLogout }: DashboardPageProps) {
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
