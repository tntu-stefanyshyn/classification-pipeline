import { Link, useParams } from 'react-router-dom';
import { Form, Formik } from 'formik';
import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import ReactFlow from 'reactflow';
import { AuthLayout } from '../../layout/AuthLayout/AuthLayout';
import { DataTable } from '../../ui/DataTable/DataTable';
import { tableLabels } from '../../ui/DataTable/constants/tableLabels';
import { Modal } from '../../ui/Modal/Modal';
import { Alert } from '../../ui/Alert/Alert';
import { FileInput } from '../../inputs/FileInput/FileInput';
import { InputField } from '../../inputs/InputField/InputField';
import { TextAreaField } from '../../inputs/TextAreaField/TextAreaField';
import { GraphSettingsModal } from '../../experiments/GraphSettingsModal/GraphSettingsModal';
import { GraphNode } from '../../experiments/ExperimentGraphConstructor/components/GraphNode/GraphNode';
import { buildFlowElements } from '../../experiments/ExperimentGraphConstructor/utils/flow';
import { ROOT_NODE_ID } from '../../experiments/ExperimentGraphConstructor/constants/graph';
import { config } from '../../../config/config';
import { isCsvFile } from '../../../utils/fileValidation';
import { formatWeightPercent } from '../../../utils/metricWeights';
import { validationSchema } from './constants/validationSchema';
import {
  experimentStatusLabels,
  graphMetricLabels,
  runStatusColors,
  runStatusLabels,
  runStatusPriority,
  statusLegendOrder,
} from './constants/statusConfig';
import {
  ClassificationStage,
  ComputationStatus,
  ExperimentStatus,
  ComputationQueue,
  refetchExperimentQuery,
  useEnqueueExperimentRunsMutation,
  useCreateUploadedFileMutation,
  useExperimentQuery,
  useExperimentRunsQuery,
  useSignedUploadUrlLazyQuery,
  useStopExperimentRunMutation,
  useUpdateExperimentMutation,
  useUploadedFilesQuery,
  type GraphStructureSettingsInput,
} from './graphql';
import type { ExperimentDetailsPageProps, PathStatus } from './ExperimentDetailsPage.types';
import { buildGraphPaths, type GraphPath } from './utils/buildGraphPaths';
import { formatTimeAgo } from './utils/formatTimeAgo';

export function ExperimentDetailsPage({ onLogout }: ExperimentDetailsPageProps) {
  const params = useParams();
  const id = params.id ?? '';
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { data, loading, error, refetch } = useExperimentQuery({
    variables: { _id: id },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  });
  const [updateExperiment, { loading: updating, error: updateError }] =
    useUpdateExperimentMutation();
  const [updateGraphSettings, { loading: settingsUpdating, error: settingsUpdateError }] =
    useUpdateExperimentMutation();
  const {
    data: uploadedFilesData,
    loading: filesLoading,
    error: filesError,
    refetch: refetchFiles,
  } = useUploadedFilesQuery({
    fetchPolicy: 'cache-and-network',
  });
  const [getSignedUrl] = useSignedUploadUrlLazyQuery();
  const [createFile] = useCreateUploadedFileMutation();
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const {
    data: runsData,
    loading: runsLoading,
    error: runsError,
    refetch: refetchRuns,
  } = useExperimentRunsQuery({
    variables: { experimentId: id },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  });
  const [enqueueRuns, { loading: enqueueing, error: enqueueError }] =
    useEnqueueExperimentRunsMutation();
  const [stopRun, { loading: stopping, error: stopError }] = useStopExperimentRunMutation();

  const experiment = data?.experiment;
  const uploadedFiles = uploadedFilesData?.uploadedFiles ?? [];
  const graph = experiment?.graph;
  const graphSettings = graph?.settings ?? null;
  const graphPaths = useMemo(() => buildGraphPaths(graph?.nodes ?? []), [graph]);
  const graphPathMap = useMemo(
    () => new Map(graphPaths.map((path) => [path.id, path])),
    [graphPaths]
  );
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [resultsPathId, setResultsPathId] = useState<string | null>(null);
  const runs = runsData?.experimentRuns ?? [];
  const isExperimentLocked =
    experiment?.status === ExperimentStatus.computing ||
    experiment?.status === ExperimentStatus.completed;
  const pathLabels = useMemo(
    () => new Map(graphPaths.map((path) => [path.id, path.label])),
    [graphPaths]
  );
  const runsByPath = useMemo(() => {
    const map = new Map<string, typeof runs>();
    runs.forEach((run) => {
      const key = run.pathNodeIds.join('.');
      const list = map.get(key) ?? [];
      list.push(run);
      map.set(key, list);
    });
    map.forEach((list) =>
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    );
    return map;
  }, [runs]);
  const resolvePathLabel = (nodeIds: string[]) =>
    pathLabels.get(nodeIds.join('.')) ?? nodeIds.join(' -> ');
  const graphSettingsReady = useMemo(() => {
    if (!graphSettings?.metrics) return false;
    if (!Array.isArray(graphSettings.queues) || graphSettings.queues.length === 0) return false;
    const { accuracy, f1, rocAuc, ntps } = graphSettings.metrics;
    const weights = [accuracy, f1, rocAuc, ntps];
    if (weights.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
      return false;
    }
    const sum = weights.reduce((total, value) => total + value, 0);
    return Math.abs(sum - 1) <= 0.0001;
  }, [graphSettings]);

  const allowedQueues = graphSettings?.queues ?? [];
  const defaultQueue = useMemo(() => {
    if (allowedQueues.includes(ComputationQueue.local)) {
      return ComputationQueue.local;
    }
    return allowedQueues[0] ?? ComputationQueue.local;
  }, [allowedQueues]);
  const queueAllowed = allowedQueues.includes(defaultQueue);
  const allPathsHaveClassification = useMemo(() => {
    if (!graph?.nodes || graphPaths.length === 0) return false;
    const nodeById = new Map(graph.nodes.map((node) => [node._id, node]));
    return graphPaths.every((path) =>
      path.nodeIds.some(
        (nodeId) => nodeById.get(nodeId)?.stage === ClassificationStage.CLASSIFICATION
      )
    );
  }, [graph, graphPaths]);

  const canStartComputations =
    Boolean(experiment && graph && graphPaths.length > 0) &&
    graphSettingsReady &&
    queueAllowed &&
    allPathsHaveClassification;
  const runBlocker = useMemo(() => {
    if (!graph || graphPaths.length === 0) {
      return 'Граф ще не створений для запуску обчислень.';
    }
    if (!graphSettingsReady) {
      return 'Заповніть налаштування графа, щоб запускати обчислення.';
    }
    if (!queueAllowed) {
      return 'Тип обчислень не дозволений у налаштуваннях графа.';
    }
    if (!allPathsHaveClassification) {
      return 'Усі шляхи мають містити етап класифікації.';
    }
    return null;
  }, [allPathsHaveClassification, graph, graphPaths.length, graphSettingsReady, queueAllowed]);
  const pathStatusMap = useMemo(() => {
    const map = new Map<string, PathStatus>();
    graphPaths.forEach((path) => {
      const runsForPath = runsByPath.get(path.id) ?? [];
      if (runsForPath.length === 0) {
        map.set(path.id, ComputationStatus.idle);
        return;
      }
      map.set(path.id, runsForPath[0].status);
    });
    return map;
  }, [graphPaths, runsByPath]);
  const reportUrl = useMemo(() => {
    if (!experiment) return '';
    const baseUrl = config.renderer.graphqlEndpoint.replace(/\/graphql\/?$/, '');
    return `${baseUrl}/experiments/${experiment._id}/report`;
  }, [experiment]);

  const handleCloseModal = () => {
    setEditModalOpen(false);
    setUploadError(null);
  };

  const openSettingsModal = () => {
    if (!experiment || isExperimentLocked) return;
    setSettingsModalOpen(true);
  };

  const closeSettingsModal = () => {
    setSettingsModalOpen(false);
  };

  const handleSaveGraphSettings = async (settings: GraphStructureSettingsInput) => {
    if (!experiment) return;
    try {
      await updateGraphSettings({
        variables: {
          input: {
            _id: experiment._id,
            graphSettings: settings,
          },
        },
        refetchQueries: [refetchExperimentQuery({ _id: experiment._id })],
        awaitRefetchQueries: true,
      });
      closeSettingsModal();
    } catch (_err) {
      // Error state is handled by settingsUpdateError.
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleStartPath = async (path: GraphPath, isRecompute = false) => {
    if (!experiment || !canStartComputations) {
      setActionStatus(runBlocker ?? 'Спочатку налаштуйте обчислення.');
      return;
    }
    try {
      const result = await enqueueRuns({
        variables: {
          input: {
            experimentId: experiment._id,
            queue: defaultQueue,
            pathNodeIds: path.nodeIds,
          },
        },
      });
      const created = result.data?.enqueueExperimentRuns ?? [];
      const queueLabel = defaultQueue === ComputationQueue.cloud ? 'хмарну' : 'локальну';
      const label = resolvePathLabel(path.nodeIds);
      setActionStatus(
        `${isRecompute ? 'Перезапуск' : 'Запуск'} додано в ${queueLabel} чергу: ${label} (${
          created.length
        }).`
      );
      await Promise.all([refetchRuns(), refetch()]);
    } catch (_err) {
      // Error state is handled by enqueueError.
    }
  };

  const handleStopPath = async (runId: string, pathLabel: string) => {
    if (!experiment) return;
    try {
      await stopRun({
        variables: {
          input: {
            runId,
          },
        },
      });
      setActionStatus(`Зупинено: ${pathLabel}.`);
      await Promise.all([refetchRuns(), refetch()]);
    } catch (_err) {
      // Error state is handled by stopError.
    }
  };

  const pathTableColumns = useMemo<ColumnDef<GraphPath>[]>(
    () => [
      {
        header: 'Шлях',
        id: 'path',
        cell: ({ row }) => (
          <div className="table-stack">
            <span className="item-title">{`Шлях ${row.index + 1}`}</span>
            <span className="muted small">{resolvePathLabel(row.original.nodeIds)}</span>
          </div>
        ),
      },
      {
        header: 'Статус',
        id: 'status',
        cell: ({ row }) => {
          const status = pathStatusMap.get(row.original.id) ?? ComputationStatus.idle;
          return status === ComputationStatus.idle ? (
            <span className="muted small">{runStatusLabels[ComputationStatus.idle]}</span>
          ) : (
            <span className={`status-pill status-${status}`}>
              {runStatusLabels[status] ?? status}
            </span>
          );
        },
      },
      {
        header: 'Результати',
        id: 'results',
        cell: ({ row }) => (
          <button
            className="btn ghost small icon"
            type="button"
            onClick={() => setResultsPathId(row.original.id)}
            aria-label={`Результати: шлях ${row.index + 1}`}
            title="Результати"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path
                d="M12 11v5"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.6"
              />
              <circle cx="12" cy="8" r="1.1" fill="currentColor" />
            </svg>
          </button>
        ),
      },
      {
        header: 'Дії',
        id: 'actions',
        cell: ({ row }) => {
          const path = row.original;
          const runsForPath = runsByPath.get(path.id) ?? [];
          const activeRun =
            runsForPath.find(
              (run) =>
                run.status === ComputationStatus.running ||
                run.status === ComputationStatus.queued ||
                run.status === ComputationStatus.paused
            ) ?? null;
          const pathLabel = resolvePathLabel(path.nodeIds);
          const actionBusy = enqueueing || stopping;
          const hasActive = Boolean(activeRun);
          const canRun = canStartComputations && !hasActive && !actionBusy;
          const canStop = Boolean(activeRun) && !stopping;
          const canRecompute =
            canStartComputations && !hasActive && runsForPath.length > 0 && !actionBusy;

          return (
            <div className="table-actions">
              <button
                className="btn ghost small icon"
                type="button"
                onClick={() => void handleStartPath(path)}
                disabled={!canRun}
                aria-label="Запустити шлях"
                title="Запуск"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 6l10 6-10 6V6z" fill="currentColor" />
                </svg>
              </button>
              <button
                className="btn ghost small icon"
                type="button"
                onClick={() =>
                  activeRun ? void handleStopPath(activeRun._id, pathLabel) : undefined
                }
                disabled={!canStop}
                aria-label="Зупинити запуск"
                title="Зупинка"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="7" y="7" width="10" height="10" fill="currentColor" />
                </svg>
              </button>
              <button
                className="btn ghost small icon"
                type="button"
                onClick={() => void handleStartPath(path, true)}
                disabled={!canRecompute}
                aria-label="Перезапустити шлях"
                title="Перезапустити"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M6.5 8.5a6 6 0 1 1 1.7 7.6"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="1.6"
                  />
                  <path
                    d="M6 5v4h4"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="1.6"
                  />
                </svg>
              </button>
            </div>
          );
        },
      },
    ],
    [
      canStartComputations,
      enqueueing,
      handleStartPath,
      handleStopPath,
      pathStatusMap,
      resolvePathLabel,
      runsByPath,
      stopping,
    ]
  );

  const localQueueLabel = 'Локальна черга';
  const cloudQueueLabel = 'Хмарна черга';
  const resolveQueueLabel = (queue: ComputationQueue) =>
    queue === ComputationQueue.cloud ? cloudQueueLabel : localQueueLabel;
  const defaultQueueLabel = queueAllowed
    ? defaultQueue === ComputationQueue.cloud
      ? cloudQueueLabel
      : localQueueLabel
    : 'Не налаштовано';
  const settingsQueueLabel = graphSettings?.queues?.length
    ? graphSettings.queues
        .map((queueType) =>
          queueType === ComputationQueue.cloud ? cloudQueueLabel : localQueueLabel
        )
        .join(', ')
    : 'Не налаштовано';
  const metricsSummary = graphSettings?.metrics
    ? [
        { key: 'accuracy', value: graphSettings.metrics.accuracy },
        { key: 'f1', value: graphSettings.metrics.f1 },
        { key: 'rocAuc', value: graphSettings.metrics.rocAuc },
        { key: 'ntps', value: graphSettings.metrics.ntps },
      ]
    : [];
  const edgeColorMap = useMemo(() => {
    const map = new Map<string, { color: string; priority: number }>();
    graphPaths.forEach((path) => {
      const status = pathStatusMap.get(path.id) ?? ComputationStatus.idle;
      const color = runStatusColors[status];
      const priority = runStatusPriority[status];
      const nodeChain = [ROOT_NODE_ID, ...path.nodeIds];
      for (let i = 1; i < nodeChain.length; i += 1) {
        const edgeId = `edge-${nodeChain[i - 1]}-${nodeChain[i]}`;
        const current = map.get(edgeId);
        if (!current || priority < current.priority) {
          map.set(edgeId, { color, priority });
        }
      }
    });
    return new Map(Array.from(map.entries()).map(([key, value]) => [key, value.color]));
  }, [graphPaths, pathStatusMap]);
  const flowInputNodes = useMemo(
    () =>
      graph?.nodes?.map((node) => ({
        _id: node._id,
        label: node.label || node.technology || 'Невідомий вузол',
        stage: node.stage ?? null,
        type: node.type ?? 'technology',
        parentId: node.parentId ?? null,
      })) ?? [],
    [graph]
  );
  const { flowNodes, flowEdges } = useMemo(() => {
    if (flowInputNodes.length === 0) {
      return { flowNodes: [], flowEdges: [] };
    }
    return buildFlowElements({
      nodes: flowInputNodes,
      selectedNodeId: null,
      graphActionsDisabled: true,
      graphUpdating: false,
      onAdd: () => undefined,
      onEdit: () => undefined,
      onDelete: () => undefined,
    });
  }, [flowInputNodes]);
  const previewEdges = useMemo(() => {
    return flowEdges.map((edge) => {
      const color = edgeColorMap.get(edge.id);
      if (!color) {
        return {
          ...edge,
          style: { stroke: 'var(--graph-edge-muted)', strokeWidth: 2, opacity: 0.35 },
        };
      }
      return {
        ...edge,
        style: { stroke: color, strokeWidth: 3, opacity: 1 },
      };
    });
  }, [edgeColorMap, flowEdges]);
  const nodeTypes = useMemo(() => ({ graphNode: GraphNode }), []);
  const hasGraphNodes = flowInputNodes.length > 0;
  const selectedResultsPath = resultsPathId ? (graphPathMap.get(resultsPathId) ?? null) : null;
  const selectedRuns = resultsPathId ? (runsByPath.get(resultsPathId) ?? []) : [];
  const latestResultRun = selectedRuns[0] ?? null;
  const datasetFile = useMemo(() => {
    if (!experiment?.fileId) return null;
    return uploadedFiles.find((file) => file._id === experiment.fileId) ?? null;
  }, [experiment?.fileId, uploadedFiles]);
  const shouldShowGraphPreview =
    experiment?.status === ExperimentStatus.computing ||
    experiment?.status === ExperimentStatus.completed;

  return (
    <AuthLayout
      badge="Експеримент"
      title={experiment?.name ?? 'Експеримент'}
      subtitle={experiment?.description || 'Опис не додано.'}
      onLogout={onLogout}
      actions={
        <>
          <button className="btn ghost" type="button" onClick={() => refetch()} disabled={loading}>
            Оновити
          </button>
          {experiment ? (
            <Link className="btn ghost" to={`/app/experiments/${experiment._id}/constructor`}>
              Конструктор
            </Link>
          ) : null}
          {experiment?.status === ExperimentStatus.completed ? (
            <a
              className="btn ghost"
              href={reportUrl}
              download={`experiment-${experiment._id}-report.pdf`}
            >
              Завантажити PDF
            </a>
          ) : null}
          <button
            className="btn primary"
            type="button"
            onClick={() => setEditModalOpen(true)}
            disabled={!experiment || isExperimentLocked}
          >
            Редагувати
          </button>
        </>
      }
    >
      {!id && <p className="error">Не вказано ідентифікатор експерименту.</p>}
      {loading && !experiment && <p className="muted">Завантаження експерименту...</p>}
      {error && <p className="error">Помилка: {error.message}</p>}
      {!loading && !error && !experiment && <p className="error">Експеримент не знайдено.</p>}

      {experiment && (
        <div className="dashboard">
          <div className="stat-grid">
            <article className="card stat-card">
              <p className="muted">Статус</p>
              <span className={`status-pill status-${experiment.status}`}>
                {experimentStatusLabels[experiment.status] ?? experiment.status}
              </span>
            </article>
            <article className="card stat-card">
              <p className="muted">Створено</p>
              <div className="stat-value">{formatTimeAgo(String(experiment.createdAt))}</div>
              <p className="muted small">Дата: {new Date(experiment.createdAt).toLocaleString()}</p>
            </article>
          </div>

          <section className="card data-card">
            <header className="card-head">
              <div>
                <h3>Налаштування графової структури</h3>
                <p className="muted">Параметри ваг метрик та обрані способи виконання обчислень.</p>
              </div>
              <button
                className="btn ghost small"
                type="button"
                onClick={openSettingsModal}
                disabled={!experiment || isExperimentLocked}
              >
                Змінити налаштування
              </button>
            </header>
            {!graphSettingsReady && (
              <Alert variant="warning">
                Налаштування графа ще не заповнені. Вкажіть ваги метрик та типи обчислень.
              </Alert>
            )}
            <div className="graph-summary-grid">
              <div className="graph-summary-item">
                <span className="muted small">Кількість шляхів</span>
                <span className="graph-summary-value">{graphPaths.length}</span>
              </div>
              <div className="graph-summary-item">
                <span className="muted small">Способи виконання</span>
                <span className="graph-settings-value">{settingsQueueLabel}</span>
              </div>
            </div>
            <div>
              <div className="form-divider">Ваги метрик (%)</div>
              {metricsSummary.length > 0 ? (
                <ul className="graph-list">
                  {metricsSummary.map((metric) => {
                    const formatted = formatWeightPercent(metric.value);
                    return (
                      <li key={metric.key}>
                        {graphMetricLabels[metric.key] ?? metric.key}:{' '}
                        {formatted ? `${formatted}%` : '—'}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="muted small">Налаштування метрик ще не задані.</p>
              )}
            </div>
          </section>

          <section className="card data-card">
            <header className="card-head">
              <div>
                <h3>Набір даних</h3>
                <p className="muted">Інформація про підключений файл експерименту.</p>
              </div>
            </header>
            {filesLoading ? (
              <p className="muted small">Завантаження інформації про файл...</p>
            ) : filesError ? (
              <Alert variant="error">Помилка файлів: {filesError.message}</Alert>
            ) : datasetFile ? (
              <div className="graph-summary-grid">
                <div className="graph-summary-item">
                  <span className="muted small">Файл</span>
                  <span className="graph-summary-value">{datasetFile.filename}</span>
                </div>
                <div className="graph-summary-item">
                  <span className="muted small">Розмір</span>
                  <span className="graph-summary-value">{datasetFile.sizeMb} МБ</span>
                </div>
              </div>
            ) : (
              <Alert variant="warning">
                До експерименту ще не додано файл. Оберіть файл у редагуванні експерименту.
              </Alert>
            )}
          </section>

          <section className="card data-card">
            <header className="card-head">
              <div>
                <h3>Шляхи класифікації</h3>
                <p className="muted">Таблиця запусків та графовий стан обчислень.</p>
              </div>
            </header>
            {!graph && <p className="muted">Граф ще не створений для запуску обчислень.</p>}
            {graph && (
              <>
                <div className="path-meta">
                  <p className="muted small">
                    Тип обчислень для запуску: <strong>{defaultQueueLabel}</strong>
                  </p>
                  {runBlocker && <p className="error small">{runBlocker}</p>}
                  {runsLoading && <p className="muted small">Оновлення статусів запусків...</p>}
                </div>
                <DataTable
                  data={graphPaths}
                  columns={pathTableColumns}
                  emptyMessage="Немає доступних шляхів у графі."
                  labels={tableLabels}
                  pageSize={6}
                  pageSizeOptions={[6, 12, 24]}
                  getRowId={(row) => row.id}
                  className="path-table"
                />
                {enqueueError && <p className="error">Помилка запуску: {enqueueError.message}</p>}
                {stopError && <p className="error">Помилка зупинки: {stopError.message}</p>}
                {runsError && <p className="error">Помилка запусків: {runsError.message}</p>}
                {actionStatus && <p className="muted small">{actionStatus}</p>}

                {shouldShowGraphPreview && (
                  <div className="graph-preview">
                    <div className="form-divider">Графова структура обчислення</div>
                    <p className="muted small">Колір шляху відповідає поточному статусу.</p>
                    <div className="graph-legend status-legend">
                      {statusLegendOrder.map((statusKey) => (
                        <div key={statusKey} className="graph-legend-item">
                          <span
                            className="graph-legend-dot"
                            style={{ background: runStatusColors[statusKey] }}
                          />
                          <span className="graph-legend-label">
                            {runStatusLabels[statusKey] ?? statusKey}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="graph-preview-chart">
                      {hasGraphNodes ? (
                        <ReactFlow
                          nodes={flowNodes}
                          edges={previewEdges}
                          nodeTypes={nodeTypes}
                          fitView
                          fitViewOptions={{ padding: 0.2 }}
                          nodesDraggable={false}
                          nodesConnectable={false}
                          zoomOnDoubleClick={false}
                          className="graph-preview-flow"
                        />
                      ) : (
                        <p className="muted small">Граф поки порожній.</p>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}

      <GraphSettingsModal
        open={settingsModalOpen}
        settings={graphSettings}
        onClose={closeSettingsModal}
        onSave={handleSaveGraphSettings}
        isBusy={settingsUpdating}
        isLocked={isExperimentLocked}
        errorMessage={settingsUpdateError?.message ?? null}
      />

      <Modal
        open={Boolean(resultsPathId)}
        title="Результати шляху"
        onClose={() => setResultsPathId(null)}
      >
        <div className="node-modal">
          {selectedResultsPath ? (
            <>
              <p className="item-title">{resolvePathLabel(selectedResultsPath.nodeIds)}</p>
              <p className="muted small">Вузлів у шляху: {selectedResultsPath.nodeIds.length}</p>
              {latestResultRun ? (
                <div className="result-details">
                  <p>
                    Статус:{' '}
                    <span className={`status-pill status-${latestResultRun.status}`}>
                      {runStatusLabels[latestResultRun.status] ?? latestResultRun.status}
                    </span>
                  </p>
                  <p>Черга: {resolveQueueLabel(latestResultRun.queue)}</p>
                  <p>Останній запуск: {new Date(latestResultRun.createdAt).toLocaleString()}</p>
                  <p>Всього запусків: {selectedRuns.length}</p>
                  <p className="muted small">
                    Результати з&apos;являться після завершення обчислень.
                  </p>
                </div>
              ) : (
                <p className="muted">Запуски для цього шляху ще не виконувались.</p>
              )}
            </>
          ) : (
            <p className="muted">Шлях не знайдено.</p>
          )}
        </div>
      </Modal>

      <Modal open={isEditModalOpen} title="Редагувати експеримент" onClose={handleCloseModal}>
        <Formik
          enableReinitialize
          initialValues={{
            name: experiment?.name ?? '',
            description: experiment?.description ?? '',
            fileId: experiment?.fileId ?? '',
          }}
          validationSchema={validationSchema}
          onSubmit={async (values, { setSubmitting, setStatus }) => {
            setStatus(undefined);
            if (!experiment) return;
            try {
              const normalizedFileId = values.fileId.trim() || null;
              await updateExperiment({
                variables: {
                  input: {
                    _id: experiment._id,
                    name: values.name.trim(),
                    description: values.description.trim() || null,
                    fileId: normalizedFileId,
                  },
                },
                refetchQueries: [refetchExperimentQuery({ _id: experiment._id })],
                awaitRefetchQueries: true,
              });
              handleCloseModal();
            } catch (_err) {
              setStatus('Не вдалося оновити експеримент.');
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {({ values, handleChange, handleBlur, isSubmitting, status, setFieldValue }) => {
            const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
              const file = event.target.files?.[0] ?? null;
              if (!file) return;

              if (!isCsvFile(file)) {
                setUploadError('Підтримуються лише CSV файли.');
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
                return;
              }

              setUploadError(null);
              setUploading(true);

              try {
                const { data: signedData } = await getSignedUrl({
                  variables: {
                    input: {
                      filename: file.name,
                      mimeType: file.type || undefined,
                    },
                  },
                });

                const signedUrl = signedData?.signedUploadUrl?.url;
                const storageKey = signedData?.signedUploadUrl?.key;
                if (!signedUrl || !storageKey) {
                  throw new Error('Не вдалося отримати дані для завантаження.');
                }

                const uploadResponse = await fetch(signedUrl, {
                  method: 'PUT',
                  body: file,
                  headers: { 'Content-Type': file.type },
                });

                if (!uploadResponse.ok) {
                  throw new Error('Помилка завантаження файла.');
                }

                const sizeMb = Math.max(1, Math.round(file.size / (1024 * 1024)));
                const { data: createdData } = await createFile({
                  variables: {
                    input: {
                      filename: file.name,
                      storageKey,
                      sizeMb,
                      status: 'uploaded',
                    },
                  },
                });

                const createdId = createdData?.createUploadedFile?._id;
                if (createdId) {
                  setFieldValue('fileId', createdId);
                }

                await refetchFiles();
              } catch (uploadErr) {
                setUploadError(
                  uploadErr instanceof Error ? uploadErr.message : 'Не вдалося завантажити файл.'
                );
              } finally {
                setUploading(false);
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
              }
            };

            return (
              <Form className="experiment-form" noValidate>
                <InputField name="name" label="Назва" disabled={isExperimentLocked} />
                <TextAreaField
                  name="description"
                  label="Опис"
                  placeholder="Опис експерименту"
                  disabled={isExperimentLocked}
                />
                <div className="form-group">
                  <label htmlFor="fileId">Файл</label>
                  <select
                    id="fileId"
                    name="fileId"
                    value={values.fileId}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    disabled={filesLoading || uploading || isExperimentLocked}
                  >
                    <option value="">Без файлу</option>
                    {uploadedFiles.map((file) => (
                      <option key={file._id} value={file._id}>
                        {file.filename}
                      </option>
                    ))}
                  </select>
                  <p className="muted small">Оберіть існуючий або завантажте новий CSV.</p>
                  <div className="file-actions">
                    <button
                      className="btn ghost small"
                      type="button"
                      onClick={handleUploadClick}
                      disabled={uploading || isExperimentLocked}
                    >
                      {uploading ? 'Завантаження...' : 'Завантажити CSV'}
                    </button>
                    {filesLoading && <span className="muted small">Завантаження файлів...</span>}
                  </div>
                  {filesError && <p className="error">Помилка файлів: {filesError.message}</p>}
                  {uploadError && <p className="error">{uploadError}</p>}
                </div>
                <FileInput
                  ref={fileInputRef}
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  disabled={isExperimentLocked}
                />
                {status && <p className="error">{status}</p>}
                {updateError && <p className="error">Помилка: {updateError.message}</p>}
                <div className="actions">
                  <button className="btn ghost" type="button" onClick={handleCloseModal}>
                    Скасувати
                  </button>
                  <button
                    className="btn primary"
                    type="submit"
                    disabled={isSubmitting || updating || isExperimentLocked}
                  >
                    {isSubmitting || updating ? 'Збереження...' : 'Зберегти зміни'}
                  </button>
                </div>
              </Form>
            );
          }}
        </Formik>
      </Modal>
    </AuthLayout>
  );
}

export default ExperimentDetailsPage;
