import { FC, type CSSProperties, useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ResultViewProps } from './ResultView.types';
import { HistoryTable } from './components';
import uk from '../../../../../../../i18n/uk';
import { DataTable } from '../../../../../../ui/DataTable';

type MetricRow = {
  metric: string;
  values: string[];
};

const formatMatrixValue = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const calculateMatrixPercent = (value: unknown, rowTotal: number) => {
  const numeric = formatMatrixValue(value);
  if (!Number.isFinite(rowTotal) || rowTotal <= 0) {
    return 0;
  }
  return (numeric / rowTotal) * 100;
};

const formatMatrixPercent = (value: unknown, rowTotal: number) => {
  return `${calculateMatrixPercent(value, rowTotal).toFixed(2)}%`;
};

const getConfusionCellStyle = (percent: number): CSSProperties => {
  const ratio = Math.max(0, Math.min(percent, 100)) / 100;
  const hue = 4 + (130 - 4) * ratio;
  const saturation = 72;
  const lightness = 93 - ratio * 38;
  const textColor = ratio >= 0.58 ? '#ffffff' : '#0b1220';

  return {
    backgroundColor: `hsl(${hue.toFixed(1)} ${saturation}% ${lightness.toFixed(1)}%)`,
    color: textColor,
    fontWeight: 700,
  };
};

const formatDuration = (value?: number) =>
  Number.isFinite(value) ? `${value?.toFixed(2)} с` : 'Немає даних';

const ResultView: FC<ResultViewProps> = ({ pipeline }) => {
  const { history, pathNodes, queue, status, progress, machineInfo } = pipeline;
  const title = pathNodes?.map((pathNode) => pathNode.label).join('->');
  const [latestLog] = history?.toReversed() ?? [];
  const [firstLog] = history ?? [];
  const payload = pipeline.computingResult;
  const channelNames = payload?.channelNames ?? [];
  const channelCount = payload?.channelNames.length;
  const eegRows = payload?.sampleCount;
  const durationLabel = formatDuration(payload?.duration);
  const hasResults = Boolean(payload);
  const predictionSampleCounts = payload?.predictionSampleCounts ?? [];
  const predictionDataPercent = payload?.predictionDataPercent;
  const confusionMatrixes = useMemo(() => {
    const matrices = payload?.confusionMatrixes ?? [];
    if (matrices.length > 0) return matrices;
    if (payload?.confusionMatrix && payload.confusionMatrix.length > 0) {
      return [payload.confusionMatrix];
    }
    return [];
  }, [payload?.confusionMatrix, payload?.confusionMatrixes]);
  const predictionSampleCount = useMemo(() => {
    const singleRaw = Number(payload?.predictionSampleCount);
    if (Number.isFinite(singleRaw) && singleRaw > 0) {
      return singleRaw;
    }
    const fromList = predictionSampleCounts.find(
      (value) => Number.isFinite(Number(value)) && Number(value) > 0
    );
    if (Number.isFinite(Number(fromList)) && Number(fromList) > 0) {
      return Number(fromList);
    }
    const firstMatrixTotal = (confusionMatrixes[0] ?? []).reduce(
      (total, row) => total + row.reduce((rowTotal, cell) => rowTotal + formatMatrixValue(cell), 0),
      0
    );
    return firstMatrixTotal > 0 ? firstMatrixTotal : null;
  }, [confusionMatrixes, payload?.predictionSampleCount, predictionSampleCounts]);
  const machineQueue = machineInfo?.queue ? uk.computationQueue[machineInfo.queue] : null;
  const machineRamLabel =
    typeof machineInfo?.memoryGb === 'number' ? `${machineInfo.memoryGb} ГБ` : 'Немає даних';
  const platformDetails = [machineInfo?.platform, machineInfo?.release, machineInfo?.arch]
    .filter(Boolean)
    .join(' ');
  const metricRows = useMemo<MetricRow[]>(
    () => [
      { metric: 'Точність', values: payload?.accuracyScores?.map(String) ?? [] },
      { metric: 'F1', values: payload?.f1Scores?.map(String) ?? [] },
      { metric: 'ROC AUC', values: payload?.rocAucScores?.map(String) ?? [] },
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
                <span>{new Date(firstLog.createdAt).toLocaleString()}</span>
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
                <p className="muted small">Перехресна валідація та параметри EEG.</p>
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
                {confusionMatrixes.length > 0 ? (
                  <div className="result-details">
                    <span className="muted small">
                      Матриці неточностей по кроках перехресної валідації
                    </span>
                    <div className="muted small">
                      {`База: ${
                        Number.isFinite(predictionSampleCount ?? Number.NaN)
                          ? predictionSampleCount
                          : 'Немає даних'
                      } рядків предікту${
                        Number.isFinite(predictionDataPercent ?? Number.NaN)
                          ? ` (${predictionDataPercent}% даних)`
                          : ''
                      }`}
                    </div>
                    {confusionMatrixes.map((matrix, matrixIndex) => {
                      return (
                        <div
                          className="result-confusion"
                          key={`confusion-matrix-${matrixIndex + 1}`}
                        >
                          <table className="confusion-table">
                            <thead>
                              <tr>
                                <th>{`Крок ${matrixIndex + 1}`}</th>
                                {matrix[0]?.map((_, columnIndex) => (
                                  <th key={`matrix-head-${matrixIndex + 1}-${columnIndex}`}>
                                    {channelNames[columnIndex] ?? `Клас ${columnIndex + 1}`}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {matrix.map((row, rowIndex) => (
                                <tr key={`matrix-row-${matrixIndex + 1}-${rowIndex}`}>
                                  <th>{channelNames[rowIndex] ?? `Клас ${rowIndex + 1}`}</th>
                                  {row.map((cell, columnIndex) => {
                                    const rowTotal = row.reduce(
                                      (rowTotal, nextCell) =>
                                        rowTotal + formatMatrixValue(nextCell),
                                      0
                                    );
                                    const cellPercent = calculateMatrixPercent(cell, rowTotal);

                                    return (
                                      <td
                                        key={`matrix-cell-${matrixIndex + 1}-${rowIndex}-${columnIndex}`}
                                        style={getConfusionCellStyle(cellPercent)}
                                      >
                                        {formatMatrixPercent(cell, rowTotal)}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="muted small">Матриці неточностей відсутні.</p>
                )}
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
                    <span>{channelNames.length ? channelNames.join(', ') : 'Немає даних'}</span>
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
                <h4 className="result-section-title">Вузол обчислення</h4>
                <p className="muted small">Пристрій, на якому виконано запуск.</p>
              </div>
            </div>
            <div className="result-meta-grid">
              <div className="result-meta-item">
                <span className="muted small">Пристрій</span>
                <span>{machineInfo?.hostname || 'Немає даних'}</span>
              </div>
              <div className="result-meta-item">
                <span className="muted small">CPU</span>
                <span>
                  {machineInfo?.cpuModel || 'Немає даних'} ({machineInfo?.cores ?? '—'} ядер)
                </span>
              </div>
              <div className="result-meta-item">
                <span className="muted small">GPU</span>
                <span>{machineInfo?.gpuModel || 'Немає даних'}</span>
              </div>
              <div className="result-meta-item">
                <span className="muted small">RAM</span>
                <span>{machineRamLabel}</span>
              </div>
              <div className="result-meta-item">
                <span className="muted small">Платформа</span>
                <span>{platformDetails || 'Немає даних'}</span>
              </div>
              <div className="result-meta-item">
                <span className="muted small">Черга вузла</span>
                <span>{machineQueue || 'Немає даних'}</span>
              </div>
            </div>
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
