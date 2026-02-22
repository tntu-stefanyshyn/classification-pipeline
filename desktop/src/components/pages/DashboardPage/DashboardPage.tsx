import { useMemo, type FC } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout } from '../../layout/AuthLayout';
import { useDashboardDataQuery, useServerInfoQuery } from './graphql';
import { formatTimeAgo } from './utils/formatTimeAgo';
import type { DashboardPageProps } from './DashboardPage.types';
import { ExperimentStatus } from '../../../graphql/types.generated';

const toTimestamp = (value: unknown): number => {
  if (!value) return 0;
  const timestamp = new Date(String(value)).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const experimentStatusLabel = (status?: ExperimentStatus | null) => {
  if (status === ExperimentStatus.creating) return 'Створення';
  if (status === ExperimentStatus.configuring) return 'Налаштування';
  if (status === ExperimentStatus.computing) return 'Обчислення';
  if (status === ExperimentStatus.optimization) return 'Оптимізація';
  if (status === ExperimentStatus.completed) return 'Завершено';
  return 'Невідомо';
};

const DashboardPage: FC<DashboardPageProps> = ({ onLogout }) => {
  const { data, loading, error, refetch } = useDashboardDataQuery({
    fetchPolicy: 'cache-and-network',
  });
  const {
    data: serverData,
    loading: serverLoading,
    error: serverError,
    refetch: refetchServerInfo,
  } = useServerInfoQuery({
    fetchPolicy: 'cache-and-network',
  });

  const files = data?.uploadedFiles ?? [];
  const experiments = data?.experiments ?? [];
  const experimentsByLastActivity = useMemo(() => {
    return experiments
      .map((experiment) => {
        const activityTimestamps = [
          toTimestamp(experiment.createdAt),
          ...(experiment.computationHosts ?? []).map((host) => toTimestamp(host?.lastSeenAt)),
          ...((experiment.optimization?.history ?? []).map((item) =>
            toTimestamp(item?.createdAt)
          ) ?? []),
        ].filter((timestamp) => timestamp > 0);

        const latestTimestamp = activityTimestamps.length
          ? Math.max(...activityTimestamps)
          : toTimestamp(experiment.createdAt);

        return {
          ...experiment,
          latestTimestamp,
        };
      })
      .sort((a, b) => b.latestTimestamp - a.latestTimestamp);
  }, [experiments]);

  const summary = useMemo(
    () => [
      {
        label: 'Завантаження',
        value: files.length,
        hint: 'файлів у черзі та обробці',
      },
      {
        label: 'Експерименти',
        value: experiments.length,
        hint: 'активні, завершені або заплановані',
      },
      {
        label: 'GraphQL',
        value: serverLoading ? '—' : (serverData?.serverInfo.version ?? 'немає'),
        hint:
          serverError?.message ??
          (serverData?.serverInfo
            ? `Статус: ${serverData.serverInfo.status}`
            : 'Немає підключення'),
      },
    ],
    [experiments.length, files.length, serverData?.serverInfo, serverError?.message, serverLoading]
  );

  return (
    <AuthLayout
      badge="Авторизований доступ"
      title="Огляд досліджень"
      subtitle="Контролюйте завантажені файли, запуски експериментів та статус GraphQL."
      onLogout={onLogout}
      actions={
        <div className="actions">
          <button
            className="btn ghost"
            type="button"
            onClick={() => {
              refetch();
              refetchServerInfo();
            }}
            disabled={loading}
          >
            Оновити дані
          </button>
        </div>
      }
    >
      <div className="stat-grid">
        {summary.map((item) => (
          <article key={item.label} className="card stat-card">
            <p className="muted">{item.label}</p>
            <div className="stat-value">{item.value}</div>
            <p className="stat-hint">{item.hint}</p>
          </article>
        ))}
      </div>

      <div className="data-grid">
        <section className="card data-card">
          <header className="card-head">
            <div>
              <h3>Завантажені файли</h3>
              <p className="muted">Слідкуйте за статусом обробки та останніми завантаженнями.</p>
            </div>
          </header>
          <div className="item-list">
            {loading && !files.length && <p className="muted">Завантаження даних...</p>}
            {error && <p className="error">Помилка: {error.message}</p>}
            {!loading && !error && files.length === 0 && (
              <p className="muted">Файлів поки немає — додайте перші дані для аналізу.</p>
            )}

            {files.map((file) => (
              <div key={file._id} className="item-row">
                <div className="item-meta">
                  <p className="item-title">{file.filename}</p>
                  <p className="muted">
                    {file.sizeMb} МБ • {formatTimeAgo(file.uploadedAt)}
                  </p>
                </div>
                <span className={`status-pill status-${file.status}`}>
                  {file.status === 'processed' ? 'Оброблено' : null}
                  {file.status === 'queued' ? 'В черзі' : null}
                  {file.status === 'ready' ? 'Готово' : null}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="card data-card">
          <header className="card-head">
            <div>
              <h3>Запуски та результати</h3>
              <p className="muted">
                Контроль прогресу експериментів і кількість виконаних прогонів.
              </p>
            </div>
          </header>
          <div className="item-list">
            {loading && !experiments.length && <p className="muted">Завантаження даних...</p>}
            {error && <p className="error">Помилка: {error.message}</p>}
            {!loading && !error && experiments.length === 0 && (
              <p className="muted">Експерименти ще не створені. Розпочніть перший запуск.</p>
            )}

            {experimentsByLastActivity.map((experiment) => (
              <div key={experiment._id} className="item-row experiment-row">
                <Link className="experiment-link" to={`/app/experiments/${experiment._id}`}>
                  <div className="item-meta">
                    <p className="item-title">{experiment.name}</p>
                    <p className="muted">
                      Остання активність{' '}
                      {formatTimeAgo(new Date(experiment.latestTimestamp).toISOString())}
                    </p>
                  </div>
                </Link>
                <div className="experiment-meta">
                  <span className={`status-pill status-${experiment.status}`}>
                    {experimentStatusLabel(experiment.status)}
                  </span>
                  <Link className="table-link small" to={`/app/experiments/${experiment._id}`}>
                    Відкрити експеримент
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card data-card">
          <header className="card-head">
            <div>
              <h3>GraphQL підключення</h3>
              <p className="muted">Стан API та версія бекенду.</p>
            </div>
          </header>
          {serverLoading && <p className="muted">Перевіряємо з&apos;єднання...</p>}
          {serverError && <p className="error">Помилка підключення: {serverError.message}</p>}
          {!serverLoading && !serverError && serverData?.serverInfo && (
            <div className="server-info">
              <p>
                Версія: <strong>{serverData.serverInfo.version}</strong>
              </p>
              <p>
                Статус:{' '}
                <span className={`status-pill status-${serverData.serverInfo.status}`}>
                  API {serverData.serverInfo.status}
                </span>
              </p>
              <p>
                Аптайм: <strong>{serverData.serverInfo.uptimeSeconds}s</strong>
              </p>
            </div>
          )}
        </section>
      </div>
    </AuthLayout>
  );
};

export default DashboardPage;
