import { useParams } from 'react-router-dom';
import { useEffect, useMemo, useState, type FC } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useApolloClient } from '@apollo/client';
import ReactFlow from 'reactflow';
import { DataTable, tableLabels } from '../../ui/DataTable';
import {
  GraphNode,
  buildFlowElements,
  ROOT_NODE_ID,
  ExperimentStatus,
} from '../../experiments/ExperimentGraphConstructor';
import {
  ClassificationStage,
  ComputationQueue,
  PipelineStatus,
} from '../../../graphql/types.generated';
import {
  runStatusColors,
  runStatusPriority,
  statusLegendOrder,
} from '../../pages/ExperimentDetailsPage';
import { buildGraphPaths } from '../../pages/ExperimentDetailsPage/utils/buildGraphPaths';
import {
  useEnqueueExperimentRunsMutation,
  useExperimentQuery,
  usePipelinesQuery,
  useStopExperimentRunMutation,
} from '../../pages/ExperimentDetailsPage/graphql';
import ResultModal from './components/ResultModal/ResultModal';
import {
  PipelinesDocument,
  type PipelinesQuery,
  type PipelinesQueryVariables,
} from '../../../graphql/queries/generated/pipelines';
import uk from '../../../i18n/uk';
import { ChangePipelineStatusButton } from './components';
import { useChangePipelineStatusMutation } from './components/ChangePipelineStatusButton/graphql/mutations/generated/ChangePipelineStatus';

const ComputationCard: FC = () => {
  const params = useParams();
  const id = params.id ?? '';
  const { data, refetch } = useExperimentQuery({
    pollInterval: 5000,
    variables: { _id: id },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  });
  const experiment = data?.experiment;
  const graph = experiment?.graph;
  const graphSettings = graph?.settings ?? null;
  const graphPaths = useMemo(() => buildGraphPaths(graph?.nodes ?? []), [graph]);
  const allowedQueues = graphSettings?.queues ?? [];
  const defaultQueue = useMemo(() => {
    if (allowedQueues.includes(ComputationQueue.local)) {
      return ComputationQueue.local;
    }
    return allowedQueues[0] ?? ComputationQueue.local;
  }, [allowedQueues]);
  const [selectedQueue, setSelectedQueue] = useState<ComputationQueue>(defaultQueue);

  useEffect(() => {
    setSelectedQueue((previousQueue) =>
      allowedQueues.includes(previousQueue) ? previousQueue : defaultQueue
    );
  }, [allowedQueues, defaultQueue]);

  const activeQueue = allowedQueues.includes(selectedQueue) ? selectedQueue : defaultQueue;
  const queueFilter = allowedQueues.length > 0 ? activeQueue : undefined;
  const {
    data: runsData,
    loading: runsLoading,
    error: runsError,
    refetch: refetchRuns,
  } = usePipelinesQuery({
    pollInterval: 5000,
    variables: { experimentId: id, queue: queueFilter },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  });
  const [resultsPathId, setResultsPathId] = useState<string | null>(null);
  const [enqueueRuns, { loading: enqueueing, error: enqueueError }] =
    useEnqueueExperimentRunsMutation();
  const [stopRun, { loading: stopping, error: stopError }] = useStopExperimentRunMutation();
  const [changePipelineStatus] = useChangePipelineStatusMutation();
  const apolloClient = useApolloClient();
  const [movingToWaiting, setMovingToWaiting] = useState(false);

  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const runs = runsData?.pipelines ?? [];
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
  const localMachineInfo = useMemo(() => {
    const runsWithMachine = runs.filter((run) => {
      const machine = run.machineInfo;
      return (
        Boolean(machine?.hostname || machine?.cpuModel || machine?.gpuModel) ||
        typeof machine?.memoryGb === 'number' ||
        typeof machine?.cores === 'number'
      );
    });
    if (runsWithMachine.length === 0) return null;

    const [latestRun] = [...runsWithMachine].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    return latestRun?.machineInfo ?? null;
  }, [runs]);
  const graphSettingsReady = useMemo(() => {
    if (!graphSettings?.metrics) return false;
    if (!Array.isArray(graphSettings.queues) || graphSettings.queues.length === 0) return false;
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

  const queueAllowed = allowedQueues.includes(activeQueue);
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
      return 'Усі конвеєри мають містити етап класифікації.';
    }
    return null;
  }, [allPathsHaveClassification, graph, graphPaths.length, graphSettingsReady, queueAllowed]);
  const pathStatusMap = useMemo(() => {
    const map = new Map<string, PipelineStatus>();
    graphPaths.forEach((path) => {
      const runsForPath = runsByPath.get(path.id) ?? [];
      if (runsForPath.length === 0) {
        map.set(path.id, PipelineStatus.idle);
        return;
      }
      map.set(path.id, runsForPath[0].status);
    });
    return map;
  }, [graphPaths, runsByPath]);
  const handleMoveAllLocalToWaiting = async () => {
    if (!id) return;

    setMovingToWaiting(true);
    try {
      const localRunsResult = await apolloClient.query<PipelinesQuery, PipelinesQueryVariables>({
        query: PipelinesDocument,
        variables: { experimentId: id, queue: ComputationQueue.local },
        fetchPolicy: 'network-only',
      });
      const localRunsToMove = (localRunsResult.data?.pipelines ?? []).filter(
        (run) => run.status === PipelineStatus.idle || run.status === PipelineStatus.running
      );

      if (localRunsToMove.length === 0) {
        setActionStatus('Немає локальних обчислень для переведення в очікування.');
        return;
      }

      await Promise.all(
        localRunsToMove.map((run) =>
          changePipelineStatus({
            variables: {
              input: {
                pipelineId: run._id,
                status: PipelineStatus.queued,
                message: 'Переведено у статус очікування',
              },
            },
          })
        )
      );

      setActionStatus(`Локальні обчислення переведено в очікування: ${localRunsToMove.length}.`);
      await Promise.all([refetchRuns(), refetch()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Невідома помилка';
      setActionStatus(`Помилка переведення в очікування: ${message}`);
    } finally {
      setMovingToWaiting(false);
    }
  };
  const handleStartPath = async (pipelineId: string, isRecompute = false) => {
    if (!experiment || !canStartComputations) {
      setActionStatus(runBlocker ?? 'Спочатку налаштуйте обчислення.');
      return;
    }
    try {
      await enqueueRuns({
        variables: {
          input: {
            experimentId: experiment._id,
            queue: activeQueue,
            pipelineId,
            rerun: true,
          },
        },
      });
      const queueLabel = activeQueue === ComputationQueue.cloud ? 'хмарну' : 'локальну';
      setActionStatus(`${isRecompute ? 'Перезапуск' : 'Запуск'} додано в ${queueLabel} чергу.`);
      await Promise.all([refetchRuns(), refetch()]);
    } catch (_err) {
      // Error state is handled by enqueueError.
    }
  };

  const handleStopPath = async (runId: string) => {
    if (!experiment) return;
    try {
      await stopRun({ variables: { input: { runId } } });
      setActionStatus(`Зупинено: ${runId}.`);
      await Promise.all([refetchRuns(), refetch()]);
    } catch (_err) {
      // Error state is handled by stopError.
    }
  };

  const pathTableColumns = [
    {
      header: 'Конвеєр',
      id: 'path',
      cell: ({ row }) => (
        <div className="table-stack">
          <span className="item-title">{`Конвеєр ${row.index + 1}`}</span>
          <span className="muted small">
            {row.original.pathNodes.map((e) => e.label).join('->')}
          </span>
        </div>
      ),
    },
    {
      header: 'Статус',
      id: 'status',
      cell: ({ row }) => {
        const status = row.original.status;
        return status === PipelineStatus.idle ? (
          <span className="muted small">{uk.computationStatus[PipelineStatus.idle]}</span>
        ) : (
          <span className={`status-pill status-${status}`}>
            {uk.computationStatus[status] ?? status}
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
          onClick={() => setResultsPathId(row.original._id)}
          aria-label={`Результати: конвеєр ${row.index + 1}`}
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
      header: 'Остання активність',
      id: 'last-activity',
      cell: ({ row }) => {
        const [latestResult] = row.original.history.toReversed() ?? [];
        return <span>{latestResult?.message}</span>;
      },
    },
    {
      header: 'Дії',
      id: 'actions',
      cell: ({ row }) => {
        const { status, _id } = row.original;
        const actionBusy = enqueueing || stopping;
        const canRun = canStartComputations && status === PipelineStatus.idle && !actionBusy;
        const canStop = status === PipelineStatus.running && !stopping;

        return (
          <div className="table-actions">
            {canRun && (
              <ChangePipelineStatusButton status={PipelineStatus.queued} pipelineId={_id}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 6l10 6-10 6V6z" fill="currentColor" />
                </svg>
              </ChangePipelineStatusButton>
            )}
            {canStop && (
              <ChangePipelineStatusButton status={PipelineStatus.idle} pipelineId={_id}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="7" y="7" width="10" height="10" fill="currentColor" />
                </svg>
              </ChangePipelineStatusButton>
            )}
          </div>
        );
      },
    },
  ] satisfies ColumnDef<PipelinesQuery['pipelines'][number]>[];

  const activeQueueLabel = queueAllowed ? uk.computationQueue[activeQueue] : 'Не налаштовано';

  const edgeColorMap = useMemo(() => {
    const map = new Map<string, { color: string; priority: number }>();
    graphPaths.forEach((path) => {
      const status = pathStatusMap.get(path.id) ?? PipelineStatus.idle;
      const color = runStatusColors[status] ?? runStatusColors[PipelineStatus.idle] ?? '#cbd5e1';
      const priority = runStatusPriority[status] ?? runStatusPriority[PipelineStatus.idle] ?? 99;
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
      collapsedNodeIds: new Set(),
      graphActionsDisabled: true,
      graphInspectionDisabled: true,
      graphUpdating: false,
      onAdd: () => undefined,
      onEdit: () => undefined,
      onDelete: () => undefined,
      onToggleCollapse: () => undefined,
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

  const shouldShowGraphPreview =
    experiment?.status === ExperimentStatus.computing ||
    experiment?.status === ExperimentStatus.optimization ||
    experiment?.status === ExperimentStatus.completed;

  return (
    <section className="card data-card">
      <header className="card-head">
        <h3>Конвеєри класифікації</h3>
        <button
          className="btn ghost small"
          type="button"
          onClick={handleMoveAllLocalToWaiting}
          disabled={movingToWaiting || !id}
        >
          {movingToWaiting ? 'Оновлюю...' : 'Перекинути все в очікування'}
        </button>
      </header>
      {!graph && <p className="muted">Граф ще не створений для запуску обчислень.</p>}
      {graph && (
        <>
          <div className="path-meta">
            <p className="muted small">
              Тип обчислень для запуску: <strong>{activeQueueLabel}</strong>
            </p>
            {allowedQueues.length > 1 && (
              <div className="path-queue-switch" role="group" aria-label="Режими виконання">
                {allowedQueues.map((queueType) => (
                  <button
                    key={queueType}
                    className={`btn small ${activeQueue === queueType ? 'primary' : 'ghost'}`}
                    type="button"
                    onClick={() => setSelectedQueue(queueType)}
                  >
                    {uk.computationQueue[queueType]}
                  </button>
                ))}
              </div>
            )}
            <p className="muted small">
              Локальний пристрій: <strong>{localMachineInfo?.hostname || 'Ще немає даних'}</strong>
            </p>
            {localMachineInfo && (
              <p className="muted small">
                CPU: {localMachineInfo.cpuModel || 'Немає даних'} ({localMachineInfo.cores ?? '—'}{' '}
                ядер), GPU: {localMachineInfo.gpuModel || 'Немає даних'}, RAM:{' '}
                {typeof localMachineInfo.memoryGb === 'number'
                  ? `${localMachineInfo.memoryGb} ГБ`
                  : 'Немає даних'}
              </p>
            )}
            {runBlocker && <p className="error small">{runBlocker}</p>}
            {runsLoading && <p className="muted small">Оновлення статусів запусків...</p>}
          </div>
          <DataTable
            data={runsData?.pipelines ?? []}
            columns={pathTableColumns}
            emptyMessage="Немає доступних конвеєрів у графі."
            labels={tableLabels}
            pageSize={6}
            pageSizeOptions={[6, 12, 24]}
            getRowId={(row) => row._id}
            className="path-table"
          />
          {enqueueError && <p className="error">Помилка запуску: {enqueueError.message}</p>}
          {stopError && <p className="error">Помилка зупинки: {stopError.message}</p>}
          {runsError && <p className="error">Помилка запусків: {runsError.message}</p>}
          {actionStatus && <p className="muted small">{actionStatus}</p>}

          {shouldShowGraphPreview && (
            <div className="graph-preview">
              <div className="form-divider">Графова структура обчислення</div>
              <p className="muted small">Колір конвеєра відповідає поточному статусу.</p>
              <div className="graph-legend status-legend">
                {statusLegendOrder.map((statusKey) => (
                  <div key={statusKey} className="graph-legend-item">
                    <span
                      className="graph-legend-dot"
                      style={{ background: runStatusColors[statusKey] }}
                    />
                    <span className="graph-legend-label">
                      {uk.computationStatus[statusKey] ?? statusKey}
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
                    proOptions={{ hideAttribution: true }}
                  />
                ) : (
                  <p className="muted small">Граф поки порожній.</p>
                )}
              </div>
            </div>
          )}
        </>
      )}

      <ResultModal resultsPathId={resultsPathId} onClose={() => setResultsPathId(null)} />
    </section>
  );
};

export default ComputationCard;
