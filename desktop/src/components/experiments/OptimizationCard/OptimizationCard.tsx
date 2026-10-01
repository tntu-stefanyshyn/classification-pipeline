import { useMemo, useState, type FC } from 'react';
import { useParams } from 'react-router-dom';
import { Alert } from '../../ui/Alert';
import { DataTable } from '../../ui/DataTable';
import { Modal } from '../../ui/Modal';
import {
  useExperimentQuery,
  useOptimizeExperimentRunsLazyQuery,
  usePipelinesQuery,
} from '../../pages/ExperimentDetailsPage/graphql';
import { buildGraphPaths } from '../../pages/ExperimentDetailsPage/utils/buildGraphPaths';
import {
  ClassificationStage,
  ComputationQueue,
  ExperimentStatus,
  OptimizationStatus,
  PipelineStatus,
} from '../../../graphql/types.generated';
import { config } from '../../../config/config';
import { useI18n } from '../../../i18n';
import { getLocalizedTechnologyLabel } from '../../../utils/technologyLabel';

type LeaderboardRow = {
  id: string;
  label: string;
  queue: ComputationQueue;
  status: PipelineStatus;
  score: number | null;
  averageAccuracy: number | null;
  averageF1: number | null;
  averageRocAuc: number | null;
  normalizedProcessingTime: number | null;
  pathNodes: string[];
};

const averageMetric = (values?: number[] | null) => {
  const numericValues = (values ?? []).filter((value) => Number.isFinite(value));
  if (numericValues.length === 0) return null;
  return numericValues.reduce((total, value) => total + value, 0) / numericValues.length;
};

const formatMetric = (value: number | null) =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(6) : '—';

const normalizeProcessingTime = (duration?: number | null, sampleCount?: number | null) => {
  if (
    typeof duration !== 'number' ||
    !Number.isFinite(duration) ||
    typeof sampleCount !== 'number' ||
    !Number.isFinite(sampleCount) ||
    sampleCount <= 0
  ) {
    return null;
  }
  return duration / sampleCount;
};

const OptimizationCard: FC = () => {
  const { locale, messages } = useI18n();
  const params = useParams();
  const id = params.id ?? '';
  const {
    data: experimentData,
    error: experimentError,
    refetch: refetchExperiment,
  } = useExperimentQuery({
    pollInterval: 5000,
    variables: { _id: id },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  });
  const {
    data: pipelinesData,
    error: pipelinesError,
    refetch: refetchPipelines,
  } = usePipelinesQuery({
    pollInterval: 5000,
    variables: { experimentId: id },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  });
  const [runOptimization, { loading: optimizing, error: optimizeError }] =
    useOptimizeExperimentRunsLazyQuery();
  const [historyOpen, setHistoryOpen] = useState(false);

  const experiment = experimentData?.experiment;
  const optimization = experiment?.optimization;
  const graph = experiment?.graph;
  const graphSettings = graph?.settings ?? null;
  const graphPaths = useMemo(
    () => buildGraphPaths(graph?.nodes ?? [], locale),
    [graph?.nodes, locale]
  );
  const pipelines = pipelinesData?.pipelines ?? [];
  const allowedQueues = graphSettings?.queues ?? [];

  const historyItems = optimization?.history ?? [];
  const latestHistory = historyItems.length > 0 ? historyItems[historyItems.length - 1] : null;

  const runsByPath = useMemo(() => {
    const map = new Map<string, typeof pipelines>();
    pipelines.forEach((run) => {
      const key = run.pathNodeIds.join('.');
      const list = map.get(key) ?? [];
      list.push(run);
      map.set(key, list);
    });
    map.forEach((list) =>
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    );
    return map;
  }, [pipelines]);

  const leaderboard: LeaderboardRow[] = useMemo(() => {
    return pipelines
      .map((pipeline) => {
        const pathLabel =
          pipeline.pathNodes
            ?.map(
              (node) =>
                getLocalizedTechnologyLabel(node.label || node.technology, locale) ||
                getLocalizedTechnologyLabel(node.technology, locale) ||
                node.label ||
                node.technology
            )
            .join(' → ') || pipeline.pathNodeIds.join(' → ');
        const score =
          pipeline.optimizationScores && pipeline.optimizationScores.length > 0
            ? pipeline.optimizationScores[pipeline.optimizationScores.length - 1]
            : null;
        const computingResult = pipeline.computingResult;
        return {
          id: pipeline._id,
          label: pathLabel,
          queue: pipeline.queue,
          status: pipeline.status,
          score,
          averageAccuracy: averageMetric(computingResult?.accuracyScores),
          averageF1: averageMetric(computingResult?.f1Scores),
          averageRocAuc: averageMetric(computingResult?.rocAucScores),
          normalizedProcessingTime: normalizeProcessingTime(
            computingResult?.duration,
            computingResult?.sampleCount
          ),
          pathNodes:
            pipeline.pathNodes?.map(
              (node) =>
                getLocalizedTechnologyLabel(node.label || node.technology, locale) ||
                getLocalizedTechnologyLabel(node.technology, locale) ||
                node.label ||
                node.technology
            ) ?? [],
        };
      })
      .filter((row) => row.score !== null) as LeaderboardRow[];
  }, [locale, pipelines]);

  const sortedLeaderboard = useMemo(
    () => [...leaderboard].sort((a, b) => (a.score ?? Infinity) - (b.score ?? Infinity)),
    [leaderboard]
  );

  const best =
    sortedLeaderboard.find((row) => row.id === optimization?.bestPipelineId) ||
    sortedLeaderboard[0] ||
    null;
  const bestPipelineData = optimization?.bestPipelineId
    ? (pipelines.find((pipeline) => pipeline._id === optimization.bestPipelineId) ?? null)
    : null;
  const pipelineBestScore =
    bestPipelineData?.optimizationScores && bestPipelineData.optimizationScores.length > 0
      ? bestPipelineData.optimizationScores[bestPipelineData.optimizationScores.length - 1]
      : null;
  const bestScore =
    optimization?.bestScore ??
    pipelineBestScore ??
    best?.score ??
    (optimization?.bestPipelineId
      ? (leaderboard.find((row) => row.id === optimization.bestPipelineId)?.score ?? null)
      : null);

  const bestDetails =
    bestPipelineData && bestScore !== null
      ? {
          label:
            bestPipelineData.pathNodes
              ?.map(
                (node) =>
                  getLocalizedTechnologyLabel(node.label || node.technology, locale) ||
                  getLocalizedTechnologyLabel(node.technology, locale) ||
                  node.label ||
                  node.technology
              )
              .join(' → ') || bestPipelineData.pathNodeIds.join(' → '),
          queue: bestPipelineData.queue,
          pathNodes:
            bestPipelineData.pathNodes?.map(
              (node) =>
                getLocalizedTechnologyLabel(node.label || node.technology, locale) ||
                getLocalizedTechnologyLabel(node.technology, locale) ||
                node.label ||
                node.technology
            ) ?? [],
          score: bestScore,
        }
      : best
        ? {
            label: best.label,
            queue: best.queue,
            pathNodes: best.pathNodes,
            score: bestScore ?? best.score ?? null,
          }
        : null;

  const optimizationStatus = optimization?.status;
  const isOptimizationRunning = optimizationStatus === OptimizationStatus.optimizing;
  const progress = typeof optimization?.progress === 'number' ? optimization.progress : null;

  const graphSettingsReady = useMemo(() => {
    if (!graphSettings?.metrics) return false;
    if (!Array.isArray(graphSettings.queues) || graphSettings.queues.length === 0) return false;
    if (
      !Number.isInteger(graphSettings.hyperOptimizationMinutesPerPipeline) ||
      (graphSettings.hyperOptimizationMinutesPerPipeline ?? 0) < 1
    ) {
      return false;
    }
    const predictDataPercent = graphSettings.predictDataPercent ?? 20;
    if (
      !Number.isInteger(predictDataPercent) ||
      predictDataPercent < 1 ||
      predictDataPercent > 99
    ) {
      return false;
    }
    const { accuracy, f1, rocAuc, ntps } = graphSettings.metrics;
    const weights = [accuracy, f1, rocAuc, ntps];
    if (weights.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
      return false;
    }
    const sum = weights.reduce((total, value) => total + value, 0);
    return Math.abs(sum - 1) <= 0.0001;
  }, [graphSettings]);

  const allPathsHaveClassification = useMemo(() => {
    if (!graph?.nodes || graphPaths.length === 0) return false;
    const nodeById = new Map(graph.nodes.map((node) => [node._id, node]));
    return graphPaths.every((path) =>
      path.nodeIds.some(
        (nodeId) => nodeById.get(nodeId)?.stage === ClassificationStage.CLASSIFICATION
      )
    );
  }, [graph?.nodes, graphPaths]);

  const allPathsCompleted = useMemo(() => {
    if (graphPaths.length === 0) return false;
    return graphPaths.every((path) => {
      const runsForPath = runsByPath.get(path.id) ?? [];
      const latestRun = runsForPath[0];
      return latestRun?.status === PipelineStatus.completed;
    });
  }, [graphPaths, runsByPath]);

  const canOptimize = useMemo(() => {
    if (!experiment || !graph || graphPaths.length === 0) return false;
    if (
      experiment.status !== ExperimentStatus.computing &&
      experiment.status !== ExperimentStatus.completed &&
      experiment.status !== ExperimentStatus.optimization
    ) {
      return false;
    }
    if (experiment.status === ExperimentStatus.optimization && isOptimizationRunning) {
      return false;
    }
    if (!graphSettingsReady) return false;
    if (!allPathsHaveClassification) return false;
    if (allowedQueues.length === 0) return false;
    if (!allPathsCompleted) return false;
    return true;
  }, [
    allPathsCompleted,
    allPathsHaveClassification,
    allowedQueues.length,
    experiment,
    graph,
    graphPaths.length,
    graphSettingsReady,
    isOptimizationRunning,
  ]);

  const optimizeBlocker = useMemo(() => {
    if (experiment?.status === ExperimentStatus.optimization && isOptimizationRunning) {
      return messages.optimizationCard.alreadyRunning;
    }
    if (
      experiment?.status !== ExperimentStatus.computing &&
      experiment?.status !== ExperimentStatus.completed &&
      experiment?.status !== ExperimentStatus.optimization
    ) {
      return messages.optimizationCard.statusBlocked;
    }
    if (!graphSettingsReady) {
      return messages.optimizationCard.settingsMissing;
    }
    if (!allPathsHaveClassification) {
      return messages.optimizationCard.classificationMissing;
    }
    if (!allPathsCompleted) {
      return messages.optimizationCard.pipelinesIncomplete;
    }
    if (allowedQueues.length === 0) {
      return messages.optimizationCard.queueMissing;
    }
    return null;
  }, [
    allPathsHaveClassification,
    allPathsCompleted,
    allowedQueues.length,
    experiment?.status,
    graphSettingsReady,
    isOptimizationRunning,
    messages.optimizationCard,
  ]);

  const optimizationButtonLabel = optimizing
    ? messages.optimizationCard.optimizing
    : optimization
      ? messages.optimizationCard.restart
      : messages.optimizationCard.start;

  const handleStartOptimization = async () => {
    if (!experiment) return;
    try {
      await runOptimization({ variables: { experimentId: experiment._id } });
      await Promise.all([refetchExperiment(), refetchPipelines()]);
    } catch (error_) {
      console.error('Failed to start optimization', error_);
    }
  };

  const bestPathNodes = bestDetails?.pathNodes?.length
    ? bestDetails.pathNodes
    : bestDetails?.label
      ? bestDetails.label.split(' → ')
      : [];

  const chartRange = useMemo(() => {
    if (sortedLeaderboard.length === 0) return { min: 0, max: 0 };
    const scores = sortedLeaderboard
      .map((row) => row.score)
      .filter((score): score is number => typeof score === 'number');
    return { min: Math.min(...scores), max: Math.max(...scores) };
  }, [sortedLeaderboard]);

  const reportUrl = useMemo(() => {
    if (!experiment) return '';
    const baseUrl = config.renderer.graphqlEndpoint.replace(/\/graphql\/?$/, '');
    return `${baseUrl}/experiments/${experiment._id}/report`;
  }, [experiment]);

  const renderBarWidth = (score: number | null) => {
    if (score === null) return '0%';
    const { min, max } = chartRange;
    if (!Number.isFinite(min) || !Number.isFinite(max) || Math.abs(max - min) < 1e-6) {
      return '60%';
    }
    const normalized = 1 - (score - min) / (max - min);
    const clamped = Math.max(0.05, Math.min(1, normalized));
    return `${(clamped * 100).toFixed(2)}%`;
  };

  if (!experiment || experimentError) {
    return (
      <section className="card data-card">
        <h3>{messages.optimizationCard.title}</h3>
        {experimentError ? (
          <Alert variant="error">
            {messages.optimizationCard.loadingError}: {experimentError.message}
          </Alert>
        ) : (
          <p className="muted">{messages.optimizationCard.experimentNotFound}</p>
        )}
      </section>
    );
  }

  return (
    <section className="card data-card">
      <header className="card-head">
        <h3>{messages.optimizationCard.title}</h3>
        <div className="card-actions">
          <button
            className="btn ghost small"
            type="button"
            onClick={handleStartOptimization}
            disabled={!canOptimize || optimizing}
            title={optimizeBlocker ?? messages.optimizationCard.start}
          >
            {optimizationButtonLabel}
          </button>
          <a
            className="btn ghost small"
            href={reportUrl}
            download={`experiment-${experiment._id}-report.pdf`}
          >
            {messages.common.downloadPdf}
          </a>
          <button className="btn ghost small" type="button" onClick={() => setHistoryOpen(true)}>
            {messages.optimizationCard.history}
          </button>
        </div>
      </header>

      {optimizeError && (
        <Alert variant="error">
          {messages.optimizationCard.startError}: {optimizeError.message}
        </Alert>
      )}
      {pipelinesError && (
        <Alert variant="error">
          {messages.optimizationCard.pipelinesError}: {pipelinesError.message}
        </Alert>
      )}

      <div className="result-section">
        <div className="result-section-head">
          <div>
            <h4 className="result-section-title">{messages.optimizationCard.progressTitle}</h4>
            <p className="muted small">
              {latestHistory?.message ?? messages.optimizationCard.progressFallback}
            </p>
          </div>
          <span className="result-count">{historyItems.length}</span>
        </div>
        {progress !== null ? (
          <div className="result-progress">
            <div className="result-progress-track">
              <div className="result-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="result-progress-value">{progress}%</span>
          </div>
        ) : (
          <p className="muted small">{messages.optimizationCard.notStarted}</p>
        )}
        {!canOptimize && optimizeBlocker ? <p className="muted small">{optimizeBlocker}</p> : null}
        <div className="result-meta-grid">
          <div className="result-meta-item">
            <span className="muted small">{messages.optimizationCard.status}</span>
            <span className="status-pill">{optimization?.status ?? '—'}</span>
          </div>
          <div className="result-meta-item">
            <span className="muted small">{messages.optimizationCard.latestMessage}</span>
            <span>{latestHistory?.message ?? '—'}</span>
          </div>
        </div>
      </div>

      <div className="result-details">
        <div className="result-section">
          <div className="result-section-head">
            <div>
              <h4 className="result-section-title">{messages.optimizationCard.bestTitle}</h4>
              <p className="muted small">{messages.optimizationCard.bestSubtitle}</p>
            </div>
          </div>
          {bestDetails ? (
            <div className="result-meta-grid">
              <div className="result-meta-item">
                <span className="muted small">{messages.optimizationCard.pipeline}</span>
                <span>{bestDetails.label}</span>
              </div>
              <div className="result-meta-item">
                <span className="muted small">{messages.optimizationCard.score}</span>
                <span>{bestDetails.score !== null ? bestDetails.score.toFixed(6) : '—'}</span>
              </div>
              <div className="result-meta-item">
                <span className="muted small">{messages.optimizationCard.execution}</span>
                <span>
                  {messages.statuses.computationQueue[bestDetails.queue] ?? bestDetails.queue}
                </span>
              </div>
              <div className="result-meta-item">
                <span className="muted small">{messages.optimizationCard.composition}</span>
                <span>{bestPathNodes.join(', ') || '—'}</span>
              </div>
            </div>
          ) : (
            <Alert variant="warning">{messages.optimizationCard.noOptimizationData}</Alert>
          )}
        </div>
      </div>

      <div className="result-section">
        <div className="result-section-head">
          <div>
            <h4 className="result-section-title">{messages.optimizationCard.leaderboardTitle}</h4>
            <p className="muted small">{messages.optimizationCard.leaderboardSubtitle}</p>
          </div>
        </div>
        {sortedLeaderboard.length > 0 ? (
          <DataTable
            data={sortedLeaderboard}
            columns={[
              { header: messages.optimizationCard.columns.pipeline, accessorKey: 'label' },
              {
                header: messages.optimizationCard.columns.integral,
                accessorKey: 'score',
                cell: ({ row }) => formatMetric(row.original.score),
                meta: { className: 'optimization-integral-column' },
              },
              {
                header: messages.optimizationCard.columns.accuracy,
                accessorKey: 'averageAccuracy',
                cell: ({ row }) => formatMetric(row.original.averageAccuracy),
                meta: { className: 'optimization-metric-column' },
              },
              {
                header: messages.optimizationCard.columns.f1,
                accessorKey: 'averageF1',
                cell: ({ row }) => formatMetric(row.original.averageF1),
                meta: { className: 'optimization-metric-column' },
              },
              {
                header: messages.optimizationCard.columns.rocAuc,
                accessorKey: 'averageRocAuc',
                cell: ({ row }) => formatMetric(row.original.averageRocAuc),
                meta: { className: 'optimization-metric-column' },
              },
              {
                header: messages.optimizationCard.columns.normalizedTime,
                accessorKey: 'normalizedProcessingTime',
                cell: ({ row }) =>
                  row.original.normalizedProcessingTime !== null
                    ? `${row.original.normalizedProcessingTime.toFixed(6)} ${messages.optimizationCard.secondsPerSample}`
                    : '—',
                meta: { className: 'optimization-metric-column' },
              },
              {
                header: messages.optimizationCard.columns.execution,
                accessorKey: 'queue',
                cell: ({ row }) => messages.statuses.computationQueue[row.original.queue],
              },
              {
                header: messages.optimizationCard.columns.status,
                accessorKey: 'status',
                cell: ({ row }) => messages.statuses.computationStatus[row.original.status],
              },
            ]}
            getRowId={(row) => row.id}
            pageSize={5}
            className="path-table optimization-leaderboard-table"
            emptyMessage={messages.optimizationCard.noRatedPipelines}
          />
        ) : (
          <p className="muted small">{messages.optimizationCard.noRatedPipelines}</p>
        )}
      </div>

      <div className="result-section">
        <div className="result-section-head">
          <div>
            <h4 className="result-section-title">{messages.optimizationCard.chartTitle}</h4>
            <p className="muted small">{messages.optimizationCard.chartSubtitle}</p>
          </div>
        </div>
        {sortedLeaderboard.length > 0 ? (
          <div className="bar-chart">
            {sortedLeaderboard.map((row, index) => (
              <div key={row.id} className="bar-chart-row">
                <span className="bar-chart-rank">{index + 1}</span>
                <div className="bar-chart-bar">
                  <div
                    className="bar-chart-fill"
                    style={{ width: renderBarWidth(row.score) }}
                    aria-label={messages.optimizationCard.chartAria(
                      row.label,
                      row.score?.toString() ?? '—'
                    )}
                  />
                </div>
                <div className="bar-chart-labels">
                  <span className="bar-chart-title">{row.label}</span>
                  <span className="bar-chart-score">
                    {row.score !== null ? row.score.toFixed(6) : '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted small">{messages.optimizationCard.noChartData}</p>
        )}
      </div>

      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title={messages.optimizationCard.historyTitle}
        footer={
          <button className="btn primary" type="button" onClick={() => setHistoryOpen(false)}>
            {messages.common.close}
          </button>
        }
      >
        {historyItems.length > 0 ? (
          <DataTable
            data={historyItems}
            columns={[
              {
                header: messages.optimizationCard.columns.time,
                accessorKey: 'createdAt',
                cell: ({ row }) => new Date(row.original.createdAt).toLocaleString(),
              },
              {
                header: messages.optimizationCard.columns.status,
                accessorKey: 'status',
              },
              {
                header: messages.optimizationCard.columns.message,
                accessorKey: 'message',
              },
            ]}
            getRowId={(_, index) => `${index}`}
            pageSize={10}
            className="path-table"
            emptyMessage={messages.optimizationCard.historyEmpty}
          />
        ) : (
          <p className="muted">{messages.optimizationCard.historyLogEmpty}</p>
        )}
      </Modal>
    </section>
  );
};

export default OptimizationCard;
