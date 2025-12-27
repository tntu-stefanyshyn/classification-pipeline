import { Link, useParams } from 'react-router-dom';
import { Form, Formik } from 'formik';
import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import ReactFlow, { Position, type Edge, type Node } from 'reactflow';
import { AuthLayout } from '../../../components/layout/AuthLayout/AuthLayout';
import { Modal } from '../../../components/ui/Modal/Modal';
import { DataTable } from '../../../components/ui/DataTable/DataTable';
import { isCsvFile } from '../../../utils/fileValidation';
import {
  FLOW_HORIZONTAL_GAP,
  FLOW_VERTICAL_GAP,
  ROOT_NODE_ID,
  ROOT_NODE_LABEL,
} from '../../../components/experiments/ExperimentGraphConstructor/constants/graph';
import { getStageLabel } from '../../../components/experiments/ExperimentGraphConstructor/utils/stage';
import { validationSchema } from './constants/validationSchema';
import {
  ComputationQueue,
  ComputationMode,
  type GraphNode,
  refetchExperimentQuery,
  useEnqueueExperimentRunsMutation,
  usePauseExperimentRunsMutation,
  useResumeExperimentRunsMutation,
  useCreateUploadedFileMutation,
  useExperimentQuery,
  useExperimentResultsQuery,
  useExperimentRunsQuery,
  useSignedUploadUrlLazyQuery,
  useUpdateExperimentMutation,
  useUploadedFilesQuery,
} from './graphql';
import type { ExperimentDetailsPageProps } from './ExperimentDetailsPage.types';
import { buildGraphPaths } from './utils/buildGraphPaths';
import { formatTimeAgo } from './utils/formatTimeAgo';
import {
  StatusGraphNode,
  type NodeRunStatus,
  type StatusGraphNodeData,
} from './components/StatusGraphNode';

type PathStatus = NodeRunStatus;

const pathStatusLabels: Record<PathStatus, string> = {
  idle: 'Не запускалось',
  queued: 'В черзі',
  running: 'Запущено',
  paused: 'Пауза',
  completed: 'Завершено',
  failed: 'Помилка',
};

const statusPriority: Record<PathStatus, number> = {
  idle: 0,
  completed: 1,
  queued: 2,
  paused: 3,
  running: 4,
  failed: 5,
};

type PathRow = {
  id: string;
  label: string;
  status: PathStatus;
  queue?: ComputationQueue | null;
  runId?: string | null;
  resultJson?: string | null;
};

type StatusFlowNode = Node<StatusGraphNodeData>;
type StatusFlowEdge = Edge;

const formatResultSnippet = (value?: string | null) => {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '—';
  if (trimmed.length <= 160) return trimmed;
  return `${trimmed.slice(0, 160)}…`;
};

const queueLabels: Record<ComputationQueue, string> = {
  [ComputationQueue.local]: 'Локально',
  [ComputationQueue.cloud]: 'Хмарно',
};

const formatQueueLabel = (queue?: ComputationQueue | null) => {
  if (!queue) return '—';
  return queueLabels[queue] ?? queue;
};

const buildStatusFlowElements = (
  nodes: GraphNode[],
  statusMap: Map<string, PathStatus>,
  onInfo: (nodeId: string) => void
): { flowNodes: StatusFlowNode[]; flowEdges: StatusFlowEdge[] } => {
  const nodeMap = new Map<string, { parentId?: string | null }>();
  nodes.forEach((node) => {
    nodeMap.set(node._id, node);
  });

  const childrenByParent = new Map<string, string[]>();
  nodes.forEach((node) => {
    const parentId = node.parentId && nodeMap.has(node.parentId) ? node.parentId : ROOT_NODE_ID;
    const list = childrenByParent.get(parentId) ?? [];
    list.push(node._id);
    childrenByParent.set(parentId, list);
  });

  const positions = new Map<string, { x: number; y: number }>();
  const layout = (nodeId: string, depth: number, startY: number) => {
    const children = childrenByParent.get(nodeId) ?? [];
    if (children.length === 0) {
      const y = startY;
      positions.set(nodeId, { x: depth * FLOW_HORIZONTAL_GAP, y });
      return { nextY: startY + FLOW_VERTICAL_GAP, centerY: y };
    }

    let currentY = startY;
    let firstCenter = startY;
    let lastCenter = startY;

    children.forEach((childId, index) => {
      const result = layout(childId, depth + 1, currentY);
      currentY = result.nextY;
      if (index === 0) firstCenter = result.centerY;
      lastCenter = result.centerY;
    });

    const centerY = (firstCenter + lastCenter) / 2;
    positions.set(nodeId, { x: depth * FLOW_HORIZONTAL_GAP, y: centerY });
    return { nextY: currentY, centerY };
  };

  layout(ROOT_NODE_ID, 0, 0);

  const rootPosition = positions.get(ROOT_NODE_ID) ?? { x: 0, y: 0 };
  const flowNodes: StatusFlowNode[] = [
    {
      id: ROOT_NODE_ID,
      type: 'statusNode',
      position: rootPosition,
      data: {
        _id: ROOT_NODE_ID,
        label: ROOT_NODE_LABEL,
        stage: null,
        status: 'idle',
        isRoot: true,
        onInfo,
      },
      draggable: false,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    },
  ];

  nodes.forEach((node) => {
    const position = positions.get(node._id) ?? { x: FLOW_HORIZONTAL_GAP, y: 0 };
    const label = node.label?.trim() || '';
    flowNodes.push({
      id: node._id,
      type: 'statusNode',
      position,
      data: {
        _id: node._id,
        label: label || getStageLabel(node.stage),
        stage: node.stage,
        status: statusMap.get(node._id) ?? 'idle',
        isRoot: false,
        onInfo,
      },
      draggable: false,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
  });

  const flowEdges: StatusFlowEdge[] = nodes.map((node) => {
    const parentId = node.parentId && nodeMap.has(node.parentId) ? node.parentId : ROOT_NODE_ID;
    return {
      id: `edge-${parentId}-${node._id}`,
      source: parentId,
      target: node._id,
      type: 'smoothstep',
    };
  });

  return { flowNodes, flowEdges };
};

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
  const {
    data: runsData,
    error: runsError,
    refetch: refetchRuns,
  } = useExperimentRunsQuery({
    variables: { experimentId: id },
    skip: !id,
    pollInterval: 5000,
    fetchPolicy: 'cache-and-network',
  });
  const {
    data: resultsData,
    loading: resultsLoading,
    error: resultsError,
  } = useExperimentResultsQuery({
    variables: { experimentId: id },
    skip: !id,
    pollInterval: 5000,
    fetchPolicy: 'cache-and-network',
  });
  const [enqueueRuns, { loading: enqueueing, error: enqueueError }] =
    useEnqueueExperimentRunsMutation();
  const [pauseRuns, { loading: pausing, error: pauseError }] =
    usePauseExperimentRunsMutation();
  const [resumeRuns, { loading: resuming, error: resumeError }] =
    useResumeExperimentRunsMutation();

  const experiment = data?.experiment;
  const uploadedFiles = uploadedFilesData?.uploadedFiles ?? [];
  const graph = experiment?.graph;
  const computationMode = graph?.computationMode ?? ComputationMode.both;
  const graphPaths = useMemo(() => buildGraphPaths(graph?.nodes ?? []), [graph]);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [nodeInfoState, setNodeInfoState] = useState<{
    nodeId: string;
    queue: ComputationQueue;
  } | null>(null);
  const runs = runsData?.experimentRuns ?? [];
  const results = resultsData?.experimentResults ?? [];
  const hasActiveRuns = runs.some(
    (run) => run.status === 'queued' || run.status === 'running'
  );
  const hasPausedRuns = runs.some((run) => run.status === 'paused');
  const runPathKeys = useMemo(
    () => new Set(runs.map((run) => run.pathNodeIds.join('.'))),
    [runs]
  );
  const availablePaths = useMemo(
    () => graphPaths.filter((path) => !runPathKeys.has(path.id)),
    [graphPaths, runPathKeys]
  );
  const queueList = useMemo<ComputationQueue[]>(() => {
    if (computationMode === ComputationMode.both) {
      return [ComputationQueue.local, ComputationQueue.cloud];
    }
    return [
      computationMode === ComputationMode.cloud ? ComputationQueue.cloud : ComputationQueue.local,
    ];
  }, [computationMode]);
  const runMapByQueue = useMemo(() => {
    const map = new Map<ComputationQueue, Map<string, (typeof runs)[number]>>();
    queueList.forEach((queue) => {
      const queueRuns = runs.filter((run) => run.queue === queue);
      map.set(
        queue,
        new Map(queueRuns.map((run) => [run.pathNodeIds.join('.'), run]))
      );
    });
    return map;
  }, [queueList, runs]);
  const resultByRunId = useMemo(
    () => new Map(results.map((result) => [result.runId, result])),
    [results]
  );
  const pathStatusByQueue = useMemo(() => {
    const map = new Map<ComputationQueue, Map<string, PathStatus>>();
    queueList.forEach((queue) => {
      const statusMap = new Map<string, PathStatus>();
      const runMap = runMapByQueue.get(queue) ?? new Map();
      graphPaths.forEach((path) => {
        const run = runMap.get(path.id);
        statusMap.set(path.id, (run?.status as PathStatus) ?? 'idle');
      });
      map.set(queue, statusMap);
    });
    return map;
  }, [graphPaths, queueList, runMapByQueue]);
  const nodeStatusMapByQueue = useMemo(() => {
    const map = new Map<ComputationQueue, Map<string, PathStatus>>();
    queueList.forEach((queue) => {
      const statusMap = pathStatusByQueue.get(queue) ?? new Map();
      const nodeMap = new Map<string, PathStatus>();
      graphPaths.forEach((path) => {
        const status = statusMap.get(path.id) ?? 'idle';
        path.nodeIds.forEach((nodeId) => {
          const current = nodeMap.get(nodeId) ?? 'idle';
          if (statusPriority[status] > statusPriority[current]) {
            nodeMap.set(nodeId, status);
          }
        });
      });
      map.set(queue, nodeMap);
    });
    return map;
  }, [graphPaths, pathStatusByQueue, queueList]);
  const nodePathsMapByQueue = useMemo(() => {
    const map = new Map<
      ComputationQueue,
      Map<
        string,
        Array<{
          pathId: string;
          label: string;
          status: PathStatus;
          resultJson?: string | null;
          queue: ComputationQueue;
        }>
      >
    >();
    queueList.forEach((queue) => {
      const runMap = runMapByQueue.get(queue) ?? new Map();
      const nodeMap = new Map<
        string,
        Array<{ pathId: string; label: string; status: PathStatus; resultJson?: string | null; queue: ComputationQueue }>
      >();
      graphPaths.forEach((path) => {
        const run = runMap.get(path.id);
        const status = (run?.status as PathStatus) ?? 'idle';
        const resultJson = run ? resultByRunId.get(run._id)?.payloadJson ?? null : null;
        const entry = {
          pathId: path.id,
          label: path.label,
          status,
          resultJson,
          queue,
        };
        path.nodeIds.forEach((nodeId) => {
          const list = nodeMap.get(nodeId) ?? [];
          list.push(entry);
          nodeMap.set(nodeId, list);
        });
      });
      map.set(queue, nodeMap);
    });
    return map;
  }, [graphPaths, queueList, resultByRunId, runMapByQueue]);
  const pathRows = useMemo<PathRow[]>(() => {
    const rows: PathRow[] = [];
    queueList.forEach((queue) => {
      const runMap = runMapByQueue.get(queue) ?? new Map();
      graphPaths.forEach((path, index) => {
        const run = runMap.get(path.id);
        const status = (run?.status as PathStatus) ?? 'idle';
        const resultJson = run ? resultByRunId.get(run._id)?.payloadJson ?? null : null;
        rows.push({
          id: `${path.id}:${queue}`,
          label: `Шлях ${index + 1}: ${path.label}`,
          status,
          queue,
          runId: run?._id ?? null,
          resultJson,
        });
      });
    });
    return rows;
  }, [graphPaths, queueList, resultByRunId, runMapByQueue]);
  const nodeById = useMemo(
    () => new Map((graph?.nodes ?? []).map((node) => [node._id, node])),
    [graph]
  );
  const nodeInfo = nodeInfoState ? nodeById.get(nodeInfoState.nodeId) ?? null : null;
  const nodeInfoStatus = nodeInfoState
    ? nodeStatusMapByQueue.get(nodeInfoState.queue)?.get(nodeInfoState.nodeId) ?? 'idle'
    : 'idle';
  const nodeInfoPaths = nodeInfoState
    ? nodePathsMapByQueue.get(nodeInfoState.queue)?.get(nodeInfoState.nodeId) ?? []
    : [];
  const nodeInfoQueueLabel = nodeInfoState ? formatQueueLabel(nodeInfoState.queue) : '';
  const statusNodeTypes = useMemo(() => ({ statusNode: StatusGraphNode }), []);
  const flowByQueue = useMemo(() => {
    const map = new Map<ComputationQueue, { flowNodes: StatusFlowNode[]; flowEdges: StatusFlowEdge[] }>();
    queueList.forEach((queue) => {
      const statusMap = nodeStatusMapByQueue.get(queue) ?? new Map();
      const flow = buildStatusFlowElements(graph?.nodes ?? [], statusMap, (nodeId) => {
        setNodeInfoState({ nodeId, queue });
      });
      map.set(queue, flow);
    });
    return map;
  }, [graph?.nodes, nodeStatusMapByQueue, queueList]);
  const singleQueue = queueList[0];
  const singleFlow = singleQueue ? flowByQueue.get(singleQueue) ?? null : null;

  const handleCloseModal = () => {
    setEditModalOpen(false);
    setUploadError(null);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleEnqueueRuns = async () => {
    if (!experiment) return;
    setActionStatus(null);
    if (!graph || graphPaths.length === 0) {
      setActionStatus('Спочатку згенеруйте граф.');
      return;
    }
    if (availablePaths.length === 0) {
      setActionStatus('Усі шляхи вже мають обчислення.');
      return;
    }

    const targetQueue =
      computationMode === ComputationMode.cloud ? ComputationQueue.cloud : ComputationQueue.local;
    try {
      const result = await enqueueRuns({
        variables: {
          input: {
            experimentId: experiment._id,
            queue: targetQueue,
            runAll: true,
          },
        },
      });
      const created = result.data?.enqueueExperimentRuns ?? [];
      const queueLabel = targetQueue === ComputationQueue.cloud ? 'хмарну' : 'локальну';
      setActionStatus(`Додано в ${queueLabel} чергу: ${created.length}.`);
      await refetchRuns();
    } catch (_err) {
      // Error state is handled by enqueueError.
    }
  };
  const handlePauseRuns = async () => {
    if (!experiment) return;
    setActionStatus(null);
    try {
      const result = await pauseRuns({
        variables: { experimentId: experiment._id },
      });
      const paused = result.data?.pauseExperimentRuns ?? [];
      setActionStatus(paused.length > 0 ? `Призупинено: ${paused.length}.` : 'Немає активних запусків.');
      await refetchRuns();
    } catch (_err) {
      // Error state is handled by pauseError.
    }
  };
  const handleResumeRuns = async () => {
    if (!experiment) return;
    setActionStatus(null);
    try {
      const result = await resumeRuns({
        variables: { experimentId: experiment._id },
      });
      const resumed = result.data?.resumeExperimentRuns ?? [];
      setActionStatus(resumed.length > 0 ? `Відновлено: ${resumed.length}.` : 'Немає зупинених запусків.');
      await refetchRuns();
    } catch (_err) {
      // Error state is handled by resumeError.
    }
  };
  const canEnqueue =
    Boolean(experiment && graph && graphPaths.length > 0) && availablePaths.length > 0;
  const showQueueColumn = computationMode === ComputationMode.both;
  const pathColumns = useMemo<ColumnDef<PathRow>[]>(() => {
    const columns: ColumnDef<PathRow>[] = [
      {
        header: 'Шлях',
        accessorKey: 'label',
        cell: (info) => <span className="item-title">{info.getValue<string>()}</span>,
      },
      {
        header: 'Статус',
        accessorKey: 'status',
        cell: (info) => {
          const status = info.getValue<PathStatus>();
          return (
            <span className={`status-pill status-${status}`}>
              {pathStatusLabels[status] ?? status}
            </span>
          );
        },
      },
      {
        header: 'Результат',
        accessorKey: 'resultJson',
        cell: (info) => {
          const row = info.row.original;
          if (row.status !== 'completed') {
            return <span className="muted">—</span>;
          }
          return <span className="result-snippet">{formatResultSnippet(row.resultJson)}</span>;
        },
      },
    ];

    if (showQueueColumn) {
      columns.splice(1, 0, {
        header: 'Виконання',
        accessorKey: 'queue',
        cell: (info) => (
          <span className="muted">{formatQueueLabel(info.getValue<ComputationQueue>())}</span>
        ),
      });
    }

    return columns;
  }, [showQueueColumn]);

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
          <button
            className="btn primary"
            type="button"
            onClick={() => setEditModalOpen(true)}
            disabled={!experiment}
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
                {experiment.status === 'running' ? 'Запущено' : null}
                {experiment.status === 'completed' ? 'Завершено' : null}
                {experiment.status === 'queued' ? 'Заплановано' : null}
                {experiment.status === 'failed' ? 'Помилка' : null}
                {experiment.status !== 'running' &&
                experiment.status !== 'completed' &&
                experiment.status !== 'queued' &&
                experiment.status !== 'failed'
                  ? experiment.status
                  : null}
              </span>
            </article>
            <article className="card stat-card">
              <p className="muted">Створено</p>
              <div className="stat-value">{formatTimeAgo(String(experiment.createdAt))}</div>
              <p className="muted small">Дата: {new Date(experiment.createdAt).toLocaleString()}</p>
            </article>
          </div>

          <div className="actions">
            <button
              className="btn primary"
              type="button"
              onClick={() => void handleEnqueueRuns()}
              disabled={!canEnqueue || enqueueing}
            >
              {enqueueing ? 'Запуск...' : 'Запустити обчислення'}
            </button>
            {hasActiveRuns && (
              <button
                className="btn ghost"
                type="button"
                onClick={() => void handlePauseRuns()}
                disabled={pausing}
              >
                {pausing ? 'Пауза...' : 'Призупинити'}
              </button>
            )}
            {hasPausedRuns && (
              <button
                className="btn ghost"
                type="button"
                onClick={() => void handleResumeRuns()}
                disabled={resuming}
              >
                {resuming ? 'Відновлення...' : 'Відновити'}
              </button>
            )}
          </div>
          {enqueueError && <p className="error">Помилка запуску: {enqueueError.message}</p>}
          {pauseError && <p className="error">Помилка паузи: {pauseError.message}</p>}
          {resumeError && <p className="error">Помилка відновлення: {resumeError.message}</p>}
          {actionStatus && <p className="muted small">{actionStatus}</p>}
          {!graph && <p className="muted small">Граф ще не створений для запуску обчислень.</p>}
          {graph && graphPaths.length === 0 && (
            <p className="muted small">Немає доступних шляхів у графі.</p>
          )}

          {graph && (
            <div className="data-grid">
              <section className="card data-card">
                <header className="card-head">
                  <div>
                    <h3>Шляхи графа</h3>
                    <p className="muted">Стан виконання та результати для кожного шляху.</p>
                  </div>
                </header>
                <div className="table-status">
                  {runsError && <p className="error">Помилка запусків: {runsError.message}</p>}
                  {resultsError && <p className="error">Помилка результатів: {resultsError.message}</p>}
                </div>
                <DataTable
                  data={pathRows}
                  columns={pathColumns}
                  emptyMessage="Немає шляхів для графа."
                  pageSize={6}
                  pageSizeOptions={[6, 12, 24]}
                  getRowId={(row) => row.id}
                />
                {resultsLoading && pathRows.length > 0 && (
                  <p className="muted small">Оновлення результатів...</p>
                )}
              </section>

              <section className="card data-card">
                <header className="card-head">
                  <div>
                    <h3>Граф обчислень</h3>
                    <p className="muted">
                      Колір вузла відповідає стану виконання шляхів.
                    </p>
                  </div>
                </header>
                {computationMode === ComputationMode.both ? (
                  <div className="graph-status-grid">
                    {[ComputationQueue.local, ComputationQueue.cloud].map((queue) => {
                      const flow = flowByQueue.get(queue);
                      return (
                        <div key={queue} className="graph-status-panel">
                          <div className="graph-status-title">{formatQueueLabel(queue)}</div>
                          <div className="graph-status-flow">
                            <ReactFlow
                              nodes={flow?.flowNodes ?? []}
                              edges={flow?.flowEdges ?? []}
                              nodeTypes={statusNodeTypes}
                              fitView
                              fitViewOptions={{ padding: 0.2 }}
                              nodesDraggable={false}
                              nodesConnectable={false}
                              zoomOnDoubleClick={false}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="graph-status-flow">
                    <ReactFlow
                      nodes={singleFlow?.flowNodes ?? []}
                      edges={singleFlow?.flowEdges ?? []}
                      nodeTypes={statusNodeTypes}
                      fitView
                      fitViewOptions={{ padding: 0.2 }}
                      nodesDraggable={false}
                      nodesConnectable={false}
                      zoomOnDoubleClick={false}
                    />
                  </div>
                )}
                {graphPaths.length === 0 && (
                  <p className="muted small">Немає шляхів для відображення.</p>
                )}
              </section>
            </div>
          )}
        </div>
      )}

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
          {({
            values,
            handleChange,
            handleBlur,
            errors,
            touched,
            isSubmitting,
            status,
            setFieldValue,
          }) => {
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
                <div className="form-group">
                  <label htmlFor="name">Назва</label>
                  <input
                    id="name"
                    name="name"
                    value={values.name}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={touched.name && errors.name ? 'input-error' : ''}
                  />
                  <p className="error error-space">
                    {touched.name && errors.name ? errors.name : '\u00A0'}
                  </p>
                </div>
                <div className="form-group">
                  <label htmlFor="description">Опис</label>
                  <textarea
                    id="description"
                    name="description"
                    value={values.description}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={touched.description && errors.description ? 'input-error' : ''}
                    placeholder="Опис експерименту"
                  />
                  <p className="error error-space">
                    {touched.description && errors.description ? errors.description : '\u00A0'}
                  </p>
                </div>
                <div className="form-group">
                  <label htmlFor="fileId">Файл</label>
                  <select
                    id="fileId"
                    name="fileId"
                    value={values.fileId}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    disabled={filesLoading || uploading}
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
                      disabled={uploading}
                    >
                      {uploading ? 'Завантаження...' : 'Завантажити CSV'}
                    </button>
                    {filesLoading && <span className="muted small">Завантаження файлів...</span>}
                  </div>
                  {filesError && <p className="error">Помилка файлів: {filesError.message}</p>}
                  {uploadError && <p className="error">{uploadError}</p>}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
                {status && <p className="error">{status}</p>}
                {updateError && <p className="error">Помилка: {updateError.message}</p>}
                <div className="actions">
                  <button className="btn ghost" type="button" onClick={handleCloseModal}>
                    Скасувати
                  </button>
                  <button className="btn primary" type="submit" disabled={isSubmitting || updating}>
                    {isSubmitting || updating ? 'Збереження...' : 'Зберегти зміни'}
                  </button>
                </div>
              </Form>
            );
          }}
        </Formik>
      </Modal>

      <Modal
        open={Boolean(nodeInfoState)}
        title={nodeInfoQueueLabel ? `Стан вузла (${nodeInfoQueueLabel})` : 'Стан вузла'}
        onClose={() => setNodeInfoState(null)}
      >
        {!nodeInfo && <p className="muted">Вузол не знайдено.</p>}
        {nodeInfo && (
          <div className="node-details">
            <p>
              <strong>Вузол:</strong> {nodeInfo.label}
            </p>
            {nodeInfoQueueLabel && (
              <p>
                <strong>Виконання:</strong> {nodeInfoQueueLabel}
              </p>
            )}
            <p>
              <strong>Статус:</strong>{' '}
              <span className={`status-pill status-${nodeInfoStatus}`}>
                {pathStatusLabels[nodeInfoStatus] ?? nodeInfoStatus}
              </span>
            </p>
            <div className="form-divider">Шляхи</div>
            {nodeInfoPaths.length === 0 && <p className="muted">Шляхів не знайдено.</p>}
            {nodeInfoPaths.length > 0 && (
              <div className="item-list">
                {nodeInfoPaths.map((path) => (
                  <div key={path.pathId} className="item-row">
                    <div className="item-meta">
                      <p className="item-title">{path.label}</p>
                      {computationMode === ComputationMode.both && (
                        <span className="muted small">{formatQueueLabel(path.queue)}</span>
                      )}
                      {path.status === 'completed' && (
                        <span className="result-snippet">
                          {formatResultSnippet(path.resultJson)}
                        </span>
                      )}
                    </div>
                    <span className={`status-pill status-${path.status}`}>
                      {pathStatusLabels[path.status] ?? path.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </AuthLayout>
  );
}

export default ExperimentDetailsPage;
