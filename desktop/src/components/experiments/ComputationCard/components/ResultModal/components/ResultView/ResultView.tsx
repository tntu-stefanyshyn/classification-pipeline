import { type CSSProperties, useMemo, type FC } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ResultViewProps } from './ResultView.types';
import { HistoryTable } from './components';
import { DataTable } from '../../../../../../ui/DataTable';
import { useI18n } from '../../../../../../../i18n';
import { getLocalizedTechnologyLabel } from '../../../../../../../utils/technologyLabel';

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

const formatMatrixPercent = (value: unknown, rowTotal: number) =>
  `${calculateMatrixPercent(value, rowTotal).toFixed(2)}%`;

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

const ResultView: FC<ResultViewProps> = ({ pipeline }) => {
  const { locale, messages } = useI18n();
  const { history, pathNodes, queue, status, progress, machineInfo } = pipeline;
  const title = pathNodes
    ?.map(
      (pathNode) =>
        getLocalizedTechnologyLabel(pathNode.label || pathNode.technology, locale) ||
        getLocalizedTechnologyLabel(pathNode.technology, locale) ||
        pathNode.label ||
        pathNode.technology
    )
    .join('->');
  const [latestLog] = history?.toReversed() ?? [];
  const [firstLog] = history ?? [];
  const payload = pipeline.computingResult;
  const channelNames = payload?.channelNames ?? [];
  const channelCount = payload?.channelNames.length;
  const eegRows = payload?.sampleCount;
  const durationLabel = Number.isFinite(payload?.duration)
    ? `${payload?.duration?.toFixed(2)} ${messages.resultView.durationSeconds}`
    : messages.resultView.noData;
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

  const metricRows = useMemo<MetricRow[]>(
    () => [
      { metric: messages.metrics.accuracy, values: payload?.accuracyScores?.map(String) ?? [] },
      { metric: messages.metrics.f1, values: payload?.f1Scores?.map(String) ?? [] },
      { metric: messages.metrics.rocAuc, values: payload?.rocAucScores?.map(String) ?? [] },
    ],
    [messages.metrics, payload?.accuracyScores, payload?.f1Scores, payload?.rocAucScores]
  );
  const maxFoldCount = useMemo(
    () => Math.max(0, ...metricRows.map((row) => row.values.length)),
    [metricRows]
  );
  const metricColumns = useMemo<ColumnDef<MetricRow>[]>(() => {
    const base: ColumnDef<MetricRow>[] = [
      {
        header: messages.resultView.metric,
        accessorKey: 'metric',
        cell: ({ row }) => <span className="item-title">{row.original.metric}</span>,
      },
    ];
    const foldColumns = Array.from({ length: maxFoldCount }, (_, index) => ({
      id: `fold-${index + 1}`,
      header: `${messages.resultView.fold} ${index + 1}`,
      cell: ({ row }: { row: { original: MetricRow } }) => (
        <span className="result-snippet">{row.original.values[index] ?? '—'}</span>
      ),
    }));
    return [...base, ...foldColumns];
  }, [maxFoldCount, messages.resultView.fold, messages.resultView.metric]);

  return (
    <div className="node-modal">
      <p className="item-title">{title}</p>
      <p className="muted small">
        {messages.experimentDetails.pipelineCount}: {pathNodes?.length}
      </p>
      {latestLog ? (
        <div className="result-details">
          <div className="result-section">
            <div className="result-section-head">
              <div>
                <h4 className="result-section-title">{messages.resultView.currentState}</h4>
                <p className="muted small">
                  {messages.resultView.latestUpdate}:{' '}
                  {new Date(latestLog.createdAt).toLocaleString()}
                </p>
              </div>
              <span className={`status-pill status-${status}`}>
                {messages.statuses.computationStatus[status]}
              </span>
            </div>
            <div className="result-meta-grid">
              <div className="result-meta-item">
                <span className="muted small">{messages.resultView.queue}</span>
                <span>{messages.statuses.computationQueue[queue]}</span>
              </div>
              <div className="result-meta-item">
                <span className="muted small">{messages.resultView.latestRun}</span>
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
            <div className="result-message">
              <span className="muted small">{messages.resultView.currentMessage}</span>
              <span>{latestLog.message}</span>
            </div>
          </div>
          <div className="result-section">
            <div className="result-section-head">
              <div>
                <h4 className="result-section-title">{messages.resultView.computingResults}</h4>
                <p className="muted small">{messages.resultView.computingSubtitle}</p>
              </div>
              <span className="result-count">{payload?.accuracyScores?.length ?? 0}</span>
            </div>
            {hasResults ? (
              <>
                <DataTable
                  data={metricRows}
                  columns={metricColumns}
                  emptyMessage={messages.resultView.noMetrics}
                />
                {confusionMatrixes.length > 0 ? (
                  <div className="result-details">
                    <span className="muted small">{messages.resultView.confusionTitle}</span>
                    <div className="muted small">
                      {`${messages.resultView.confusionBase}: ${
                        Number.isFinite(predictionSampleCount ?? Number.NaN)
                          ? predictionSampleCount
                          : messages.resultView.noData
                      } ${messages.resultView.confusionPredictionRows}${
                        Number.isFinite(predictionDataPercent ?? Number.NaN)
                          ? ` (${predictionDataPercent}% ${messages.resultView.confusionDataPart})`
                          : ''
                      }`}
                    </div>
                    {confusionMatrixes.map((matrix, matrixIndex) => (
                      <div className="result-confusion" key={`confusion-matrix-${matrixIndex + 1}`}>
                        <table className="confusion-table">
                          <thead>
                            <tr>
                              <th>{`${messages.resultView.fold} ${matrixIndex + 1}`}</th>
                              {matrix[0]?.map((_, columnIndex) => (
                                <th key={`matrix-head-${matrixIndex + 1}-${columnIndex}`}>
                                  {channelNames[columnIndex] ??
                                    `${messages.resultView.classLabel} ${columnIndex + 1}`}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {matrix.map((row, rowIndex) => (
                              <tr key={`matrix-row-${matrixIndex + 1}-${rowIndex}`}>
                                <th>
                                  {channelNames[rowIndex] ??
                                    `${messages.resultView.classLabel} ${rowIndex + 1}`}
                                </th>
                                {row.map((cell, columnIndex) => {
                                  const rowTotal = row.reduce(
                                    (rowTotal, nextCell) => rowTotal + formatMatrixValue(nextCell),
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
                    ))}
                  </div>
                ) : (
                  <p className="muted small">{messages.resultView.confusionMissing}</p>
                )}
                <div className="result-meta-grid">
                  <div className="result-meta-item">
                    <span className="muted small">{messages.resultView.duration}</span>
                    <span>{durationLabel}</span>
                  </div>
                  <div className="result-meta-item">
                    <span className="muted small">{messages.resultView.eegRows}</span>
                    <span>{Number.isFinite(eegRows) ? eegRows : messages.resultView.noData}</span>
                  </div>
                  <div className="result-meta-item">
                    <span className="muted small">{messages.resultView.channelCount}</span>
                    <span>{channelCount ?? messages.resultView.noData}</span>
                  </div>
                  <div className="result-meta-item">
                    <span className="muted small">{messages.resultView.channelNames}</span>
                    <span>
                      {channelNames.length ? channelNames.join(', ') : messages.resultView.noData}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <p className="muted">{messages.resultView.resultsMissing}</p>
            )}
          </div>
          <div className="result-section">
            <div className="result-section-head">
              <div>
                <h4 className="result-section-title">{messages.resultView.nodeTitle}</h4>
                <p className="muted small">{messages.resultView.nodeSubtitle}</p>
              </div>
            </div>
            <div className="result-meta-grid">
              <div className="result-meta-item">
                <span className="muted small">{messages.resultView.device}</span>
                <span>{machineInfo?.hostname || messages.resultView.noData}</span>
              </div>
              <div className="result-meta-item">
                <span className="muted small">{messages.resultView.cpu}</span>
                <span>
                  {machineInfo?.cpuModel || messages.resultView.noData} ({machineInfo?.cores ?? '—'}{' '}
                  {messages.resultView.cores})
                </span>
              </div>
              <div className="result-meta-item">
                <span className="muted small">{messages.resultView.gpu}</span>
                <span>{machineInfo?.gpuModel || messages.resultView.noData}</span>
              </div>
              <div className="result-meta-item">
                <span className="muted small">{messages.resultView.ram}</span>
                <span>
                  {typeof machineInfo?.memoryGb === 'number'
                    ? `${machineInfo.memoryGb} GB`
                    : messages.resultView.noData}
                </span>
              </div>
              <div className="result-meta-item">
                <span className="muted small">{messages.resultView.platform}</span>
                <span>
                  {[machineInfo?.platform, machineInfo?.release, machineInfo?.arch]
                    .filter(Boolean)
                    .join(' ') || messages.resultView.noData}
                </span>
              </div>
              <div className="result-meta-item">
                <span className="muted small">{messages.resultView.nodeQueue}</span>
                <span>
                  {machineInfo?.queue
                    ? messages.statuses.computationQueue[machineInfo.queue]
                    : messages.resultView.noData}
                </span>
              </div>
            </div>
          </div>
          <div className="result-section">
            <div className="result-section-head">
              <div>
                <h4 className="result-section-title">{messages.resultView.executionHistory}</h4>
                <p className="muted small">{messages.resultView.historySubtitle}</p>
              </div>
              <span className="result-count">{history.length + 1}</span>
            </div>
            <HistoryTable history={history} />
          </div>
        </div>
      ) : (
        <p className="muted">{messages.resultView.runsMissing}</p>
      )}
    </div>
  );
};

export default ResultView;
