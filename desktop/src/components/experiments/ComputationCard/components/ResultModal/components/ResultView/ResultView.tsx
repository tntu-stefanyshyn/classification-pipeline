import { FC, useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ResultViewProps } from './ResultView.types';
import { HistoryTable } from './components';
import uk from '../../../../../../../i18n/uk';
import { DataTable } from '../../../../../../ui/DataTable';

type MetricRow = {
  metric: string;
  values: string[];
};

const formatDuration = (value?: number) =>
  Number.isFinite(value) ? `${value?.toFixed(2)} с` : 'Немає даних';

const ResultView: FC<ResultViewProps> = ({ pipeline }) => {
  const { history, pathNodes, queue, status, progress } = pipeline;
  const title = pathNodes?.map((pathNode) => pathNode.label).join('->');
  const [latestLog] = history?.toReversed() ?? [];
  const [firstLog] = history ?? [];
  const payload = pipeline.computingResult;
  const channelNames = payload?.channelNames ?? [];
  const channelCount = payload?.channelNames.length;
  const eegRows = payload?.sampleCount;
  const durationLabel = formatDuration(payload?.duration);
  const hasResults = Boolean(payload);
  const metricRows = useMemo<MetricRow[]>(
    () => [
      { metric: 'Accuracy (CV)', values: payload?.accuracyScores?.map(String) ?? [] },
      { metric: 'F1 (CV)', values: payload?.f1Scores?.map(String) ?? [] },
      { metric: 'ROC AUC (CV)', values: payload?.rocAucScores?.map(String) ?? [] },
    ],
    [payload?.accuracyScores, payload?.f1Scores, payload?.rocAucScores]
  );
  const maxFoldCount = useMemo(
    () => Math.max(0, ...metricRows.map((row) => row.values.length)),
    [metricRows]
  );
  const metricColumns = useMemo<ColumnDef<MetricRow>[]>(() => {
    const base: ColumnDef<MetricRow>[] = [
      {
        header: 'Метрика',
        accessorKey: 'metric',
        cell: ({ row }) => <span className="item-title">{row.original.metric}</span>,
      },
    ];
    const foldColumns = Array.from({ length: maxFoldCount }, (_, index) => ({
      id: `fold-${index + 1}`,
      header: `Крок ${index + 1}`,
      cell: ({ row }: { row: { original: MetricRow } }) => (
        <span className="result-snippet">{row.original.values[index] ?? '—'}</span>
      ),
    }));
    return [...base, ...foldColumns];
  }, [maxFoldCount]);

  return (
    <div className="node-modal">
      <p className="item-title">{title}</p>
      <p className="muted small">Вузлів у шляху: {pathNodes?.length}</p>
      {latestLog ? (
        <div className="result-details">
          <div className="result-section">
            <div className="result-section-head">
              <div>
                <h4 className="result-section-title">Поточний стан</h4>
                <p className="muted small">
                  Останнє оновлення: {new Date(latestLog.createdAt).toLocaleString()}
                </p>
              </div>
              <span className={`status-pill status-${status}`}>{uk.computationStatus[status]}</span>
            </div>
            <div className="result-meta-grid">
              <div className="result-meta-item">
                <span className="muted small">Черга</span>
                <span>{uk.computationQueue[queue]}</span>
              </div>
              <div className="result-meta-item">
                <span className="muted small">Останній запуск</span>
                <span>{firstLog.createdAt.toLocaleString()}</span>
              </div>
            </div>
            {typeof progress === 'number' ? (
              <div className="result-progress">
                <div className="result-progress-track">
                  <div className="result-progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <span className="result-progress-value">{progress}%</span>
              </div>
            ) : null}
            {latestLog ? (
              <div className="result-message">
                <span className="muted small">Поточне повідомлення</span>
                <span>{latestLog.message}</span>
              </div>
            ) : null}
          </div>
          <div className="result-section">
            <div className="result-section-head">
              <div>
                <h4 className="result-section-title">Результати обчислення</h4>
                <p className="muted small">Кросвалідація та параметри EEG.</p>
              </div>
              <span className="result-count">{payload?.accuracyScores?.length ?? 0}</span>
            </div>
            {hasResults ? (
              <>
                <DataTable
                  data={metricRows}
                  columns={metricColumns}
                  emptyMessage="Немає метрик для відображення."
                />
                <div className="result-meta-grid">
                  <div className="result-meta-item">
                    <span className="muted small">Час виконання</span>
                    <span>{durationLabel}</span>
                  </div>
                  <div className="result-meta-item">
                    <span className="muted small">Рядків EEG</span>
                    <span>{Number.isFinite(eegRows) ? eegRows : 'Немає даних'}</span>
                  </div>
                  <div className="result-meta-item">
                    <span className="muted small">Кількість каналів</span>
                    <span>{channelCount ?? 'Немає даних'}</span>
                  </div>
                  <div className="result-meta-item">
                    <span className="muted small">Назви каналів</span>
                    <span className="result-snippet">
                      {channelNames.length ? channelNames.join(', ') : 'Немає даних'}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <p className="muted">Результати обчислення ще не доступні.</p>
            )}
          </div>
          <div className="result-section">
            <div className="result-section-head">
              <div>
                <h4 className="result-section-title">Історія виконання</h4>
                <p className="muted small">Кроки, події та метрики процесу.</p>
              </div>
              <span className="result-count">{history.length + 1}</span>
            </div>
            <HistoryTable history={history} />
          </div>
        </div>
      ) : (
        <p className="muted">Запуски для цього шляху ще не виконувались.</p>
      )}
    </div>
  );
};

export default ResultView;
