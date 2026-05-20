import { useParams } from 'react-router-dom';
import { useEffect, useMemo, useState, type FC } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useApolloClient } from '@apollo/client';
import ReactFlow from 'reactflow';
import { DataTable } from '../../ui/DataTable';
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
import { ChangePipelineStatusButton } from './components';
import { useChangePipelineStatusMutation } from './components/ChangePipelineStatusButton/graphql/mutations/generated/ChangePipelineStatus';
import { useI18n } from '../../../i18n';
import { getLocalizedTechnologyLabel } from '../../../utils/technologyLabel';

const ComputationCard: FC = () => {
  const { locale, messages } = useI18n();
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
  const graphPaths = useMemo(() => buildGraphPaths(graph?.nodes ?? [], locale), [graph, locale]);
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
      return messages.computationCard.graphMissing;
    }
    if (!graphSettingsReady) {
      return messages.computationCard.settingsMissing;
    }
    if (!queueAllowed) {
      return messages.computationCard.queueMissing;
    }
    if (!allPathsHaveClassification) {
      return messages.computationCard.classificationMissing;
    }
    return null;
  }, [
    allPathsHaveClassification,
    graph,
    graphPaths.length,
    graphSettingsReady,
    messages,
    queueAllowed,
  ]);

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
        setActionStatus(messages.computationCard.noLocalRuns);
        return;
      }

      await Promise.all(
        localRunsToMove.map((run) =>
          changePipelineStatus({
            variables: {
              input: {
                pipelineId: run._id,
                status: PipelineStatus.queued,
                message: messages.computationCard.movedToWaiting,
              },
            },
          })
        )
      );

      setActionStatus(`${messages.computationCard.waitingResult}: ${localRunsToMove.length}.`);
      await Promise.all([refetchRuns(), refetch()]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : messages.computationCard.unknownError;
      setActionStatus(`${messages.computationCard.waitingError}: ${message}`);
    } finally {
      setMovingToWaiting(false);
    }
  };

  const pathTableColumns = [
    {
      header: messages.computationCard.columns.pipeline,
      id: 'path',
      cell: ({
        row,
      }: {
        row: { index: number; original: PipelinesQuery['pipelines'][number] };
      }) => (
        <div className="table-stack">
          <span className="item-title">{messages.computationCard.pipelineName(row.index + 1)}</span>
          <span className="muted small">
            {row.original.pathNodes
              .map(
                (node) =>
                  getLocalizedTechnologyLabel(node.label || node.technology, locale) ||
                  getLocalizedTechnologyLabel(node.technology, locale) ||
                  node.label ||
                  node.technology
              )
              .join('->')}
          </span>
        </div>
      ),
    },
    {
      header: messages.computationCard.columns.status,
      id: 'status',
      cell: ({ row }: { row: { original: PipelinesQuery['pipelines'][number] } }) => {
        const status = row.original.status;
        return status === PipelineStatus.idle ? (
          <span className="muted small">
            {messages.statuses.computationStatus[PipelineStatus.idle]}
          </span>
        ) : (
          <span className={`status-pill status-${status}`}>
            {messages.statuses.computationStatus[status] ?? status}
          </span>
        );
      },
    },
    {
      header: messages.computationCard.columns.results,
      id: 'results',
      cell: ({
        row,
      }: {
        row: { index: number; original: PipelinesQuery['pipelines'][number] };
      }) => (
        <button
          className="btn ghost small icon"
          type="button"
          onClick={() => setResultsPathId(row.original._id)}
          aria-label={messages.computationCard.resultAria(row.index + 1)}
          title={messages.computationCard.results}
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
      header: messages.computationCard.columns.latestActivity,
      id: 'last-activity',
      cell: ({ row }: { row: { original: PipelinesQuery['pipelines'][number] } }) => {
        const [latestResult] = row.original.history.toReversed() ?? [];
        return <span>{latestResult?.message}</span>;
      },
    },
    {
      header: messages.computationCard.columns.actions,
      id: 'actions',
      cell: ({ row }: { row: { original: PipelinesQuery['pipelines'][number] } }) => {
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

  const activeQueueLabel = queueAllowed
    ? messages.statuses.computationQueue[activeQueue]
    : messages.common.notConfigured;

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
        label:
          getLocalizedTechnologyLabel(node.label || node.technology, locale) ||
          messages.common.unknown,
        stage: node.stage ?? null,
        type: node.type ?? 'technology',
        parentId: node.parentId ?? null,
      })) ?? [],
    [graph, locale, messages.common.unknown]
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
        <h3>{messages.computationCard.pipelinesTitle}</h3>
        <button
          className="btn ghost small"
          type="button"
          onClick={handleMoveAllLocalToWaiting}
          disabled={movingToWaiting || !id}
        >
          {movingToWaiting
            ? messages.computationCard.moving
            : messages.computationCard.moveToWaiting}
        </button>
      </header>
      {!graph && <p className="muted">{messages.computationCard.graphMissing}</p>}
      {graph && (
        <>
          <div className="path-meta">
            <p className="muted small">
              {messages.computationCard.currentQueue}: <strong>{activeQueueLabel}</strong>
            </p>
            {allowedQueues.length > 1 && (
              <div
                className="path-queue-switch"
                role="group"
                aria-label={messages.computationCard.executionModes}
              >
                {allowedQueues.map((queueType) => (
                  <button
                    key={queueType}
                    className={`btn small ${activeQueue === queueType ? 'primary' : 'ghost'}`}
                    type="button"
                    onClick={() => setSelectedQueue(queueType)}
                  >
                    {messages.statuses.computationQueue[queueType]}
                  </button>
                ))}
              </div>
            )}
            <p className="muted small">
              {messages.computationCard.localDevice}:{' '}
              <strong>
                {localMachineInfo?.hostname || messages.computationCard.noMachineData}
              </strong>
            </p>
            {localMachineInfo && (
              <p className="muted small">
                CPU: {localMachineInfo.cpuModel || messages.resultView.noData} (
                {localMachineInfo.cores ?? '—'} {messages.resultView.cores}), GPU:{' '}
                {localMachineInfo.gpuModel || messages.resultView.noData}, RAM:{' '}
                {typeof localMachineInfo.memoryGb === 'number'
                  ? `${localMachineInfo.memoryGb} GB`
                  : messages.resultView.noData}
              </p>
            )}
            {runBlocker && <p className="error small">{runBlocker}</p>}
            {runsLoading && (
              <p className="muted small">{messages.computationCard.refreshStatuses}</p>
            )}
          </div>
          <DataTable
            data={runsData?.pipelines ?? []}
            columns={pathTableColumns}
            emptyMessage={messages.computationCard.noPipelines}
            pageSize={6}
            pageSizeOptions={[6, 12, 24]}
            getRowId={(row) => row._id}
            className="path-table"
          />
          {enqueueError && (
            <p className="error">
              {messages.computationCard.startError}: {enqueueError.message}
            </p>
          )}
          {stopError && (
            <p className="error">
              {messages.computationCard.stopError}: {stopError.message}
            </p>
          )}
          {runsError && (
            <p className="error">
              {messages.computationCard.runsError}: {runsError.message}
            </p>
          )}
          {actionStatus && <p className="muted small">{actionStatus}</p>}

          {shouldShowGraphPreview && (
            <div className="graph-preview">
              <div className="form-divider">{messages.computationCard.previewTitle}</div>
              <p className="muted small">{messages.computationCard.previewSubtitle}</p>
              <div className="graph-legend status-legend">
                {statusLegendOrder.map((statusKey) => (
                  <div key={statusKey} className="graph-legend-item">
                    <span
                      className="graph-legend-dot"
                      style={{ background: runStatusColors[statusKey] }}
                    />
                    <span className="graph-legend-label">
                      {messages.statuses.computationStatus[statusKey] ?? statusKey}
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
                  <p className="muted small">{messages.computationCard.graphEmpty}</p>
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
