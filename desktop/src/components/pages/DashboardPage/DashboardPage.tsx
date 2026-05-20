import { useMemo, type FC } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout } from '../../layout/AuthLayout';
import { useDashboardDataQuery, useServerInfoQuery } from './graphql';
import { formatTimeAgo } from './utils/formatTimeAgo';
import type { DashboardPageProps } from './DashboardPage.types';
import { ExperimentStatus } from '../../../graphql/types.generated';
import { useI18n } from '../../../i18n';

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
  const { locale, messages } = useI18n();
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
        label: messages.dashboard.summary.uploadsLabel,
        value: files.length,
        hint: messages.dashboard.summary.uploadsHint,
      },
      {
        label: messages.dashboard.summary.experimentsLabel,
        value: experiments.length,
        hint: messages.dashboard.summary.experimentsHint,
      },
      {
        label: messages.dashboard.summary.graphqlLabel,
        value: serverLoading ? '—' : (serverData?.serverInfo.version ?? messages.common.none),
        hint:
          serverError?.message ??
          (serverData?.serverInfo
            ? `${messages.dashboard.summary.statusPrefix}: ${serverData.serverInfo.status}`
            : messages.dashboard.summary.noConnection),
      },
    ],
    [
      experiments.length,
      files.length,
      messages.common.none,
      messages.dashboard.summary.experimentsHint,
      messages.dashboard.summary.experimentsLabel,
      messages.dashboard.summary.graphqlLabel,
      messages.dashboard.summary.noConnection,
      messages.dashboard.summary.statusPrefix,
      messages.dashboard.summary.uploadsHint,
      messages.dashboard.summary.uploadsLabel,
      serverData?.serverInfo,
      serverError?.message,
      serverLoading,
    ]
  );

  return (
    <AuthLayout
      badge={messages.dashboard.badge}
      title={messages.dashboard.title}
      subtitle={messages.dashboard.subtitle}
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
            {messages.dashboard.refresh}
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
              <h3>{messages.dashboard.files.title}</h3>
              <p className="muted">{messages.dashboard.files.subtitle}</p>
            </div>
          </header>
          <div className="item-list">
            {loading && !files.length && (
              <p className="muted">{messages.dashboard.files.loading}</p>
            )}
            {error && (
              <p className="error">
                {messages.common.errorPrefix}: {error.message}
              </p>
            )}
            {!loading && !error && files.length === 0 && (
              <p className="muted">{messages.dashboard.files.empty}</p>
            )}

            {files.map((file) => (
              <div key={file._id} className="item-row">
                <div className="item-meta">
                  <p className="item-title">{file.filename}</p>
                  <p className="muted">
                    {file.sizeMb} {messages.dashboard.files.mb} •{' '}
                    {formatTimeAgo(file.uploadedAt, locale)}
                  </p>
                </div>
                <span className={`status-pill status-${file.status}`}>
                  {messages.statuses.fileStatus[
                    file.status as keyof typeof messages.statuses.fileStatus
                  ] ?? file.status}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="card data-card">
          <header className="card-head">
            <div>
              <h3>{messages.dashboard.experiments.title}</h3>
              <p className="muted">{messages.dashboard.experiments.subtitle}</p>
            </div>
          </header>
          <div className="item-list">
            {loading && !experiments.length && (
              <p className="muted">{messages.dashboard.experiments.loading}</p>
            )}
            {error && (
              <p className="error">
                {messages.common.errorPrefix}: {error.message}
              </p>
            )}
            {!loading && !error && experiments.length === 0 && (
              <p className="muted">{messages.dashboard.experiments.empty}</p>
            )}

            {experimentsByLastActivity.map((experiment) => (
              <div key={experiment._id} className="item-row experiment-row">
                <Link className="experiment-link" to={`/app/experiments/${experiment._id}`}>
                  <div className="item-meta">
                    <p className="item-title">{experiment.name}</p>
                    <p className="muted">
                      {messages.dashboard.experiments.latestActivity}{' '}
                      {formatTimeAgo(new Date(experiment.latestTimestamp).toISOString(), locale)}
                    </p>
                  </div>
                </Link>
                <div className="experiment-meta">
                  <span className={`status-pill status-${experiment.status}`}>
                    {messages.statuses.experimentStatus[experiment.status!] ??
                      experimentStatusLabel(experiment.status)}
                  </span>
                  <Link className="table-link small" to={`/app/experiments/${experiment._id}`}>
                    {messages.dashboard.experiments.open}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card data-card">
          <header className="card-head">
            <div>
              <h3>{messages.dashboard.server.title}</h3>
              <p className="muted">{messages.dashboard.server.subtitle}</p>
            </div>
          </header>
          {serverLoading && <p className="muted">{messages.dashboard.server.checking}</p>}
          {serverError && (
            <p className="error">
              {messages.dashboard.server.connectionError}: {serverError.message}
            </p>
          )}
          {!serverLoading && !serverError && serverData?.serverInfo && (
            <div className="server-info">
              <p>
                {messages.dashboard.server.version}:{' '}
                <strong>{serverData.serverInfo.version}</strong>
              </p>
              <p>
                {messages.dashboard.server.status}:{' '}
                <span className={`status-pill status-${serverData.serverInfo.status}`}>
                  API {serverData.serverInfo.status}
                </span>
              </p>
              <p>
                {messages.dashboard.server.uptime}:{' '}
                <strong>{serverData.serverInfo.uptimeSeconds}s</strong>
              </p>
            </div>
          )}
        </section>
      </div>
    </AuthLayout>
  );
};

export default DashboardPage;
