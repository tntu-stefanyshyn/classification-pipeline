import { Link, useParams } from 'react-router-dom';
import { Form, Formik } from 'formik';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { AuthLayout } from '../../../components/layout/AuthLayout/AuthLayout';
import { Modal } from '../../../components/ui/Modal/Modal';
import { isCsvFile } from '../../../utils/fileValidation';
import { validationSchema } from './constants/validationSchema';
import {
  ComputationQueue,
  ComputationMode,
  refetchExperimentQuery,
  useEnqueueExperimentRunsMutation,
  useCreateUploadedFileMutation,
  useExperimentQuery,
  useExperimentRunsQuery,
  useSignedUploadUrlLazyQuery,
  useUpdateExperimentMutation,
  useUploadedFilesQuery,
} from './graphql';
import type { ExperimentDetailsPageProps } from './ExperimentDetailsPage.types';
import { buildGraphPaths } from './utils/buildGraphPaths';
import { countGraphPaths } from './utils/countGraphPaths';
import { formatTimeAgo } from './utils/formatTimeAgo';

const runStatusLabels: Record<string, string> = {
  queued: 'В черзі',
  running: 'Запущено',
  completed: 'Завершено',
  failed: 'Помилка',
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
    loading: runsLoading,
    error: runsError,
    refetch: refetchRuns,
  } = useExperimentRunsQuery({
    variables: { experimentId: id },
    skip: !id,
    pollInterval: 5000,
    fetchPolicy: 'cache-and-network',
  });
  const [enqueueRuns, { loading: enqueueing, error: enqueueError }] =
    useEnqueueExperimentRunsMutation();

  const experiment = data?.experiment;
  const uploadedFiles = uploadedFilesData?.uploadedFiles ?? [];
  const graph = experiment?.graph;
  const computationMode = graph?.computationMode ?? ComputationMode.both;
  const pathsCount = useMemo(() => countGraphPaths(graph?.nodes ?? []), [graph]);
  const graphPaths = useMemo(() => buildGraphPaths(graph?.nodes ?? []), [graph]);
  const graphPathMap = useMemo(
    () => new Map(graphPaths.map((path) => [path.id, path])),
    [graphPaths]
  );
  const [selectedPathId, setSelectedPathId] = useState('all');
  const [queue, setQueue] = useState(ComputationQueue.local);
  const [enqueueStatus, setEnqueueStatus] = useState<string | null>(null);
  const runs = runsData?.experimentRuns ?? [];
  const localRuns = runs.filter((run) => run.queue === ComputationQueue.local);
  const cloudRuns = runs.filter((run) => run.queue === ComputationQueue.cloud);
  const pathLabels = useMemo(
    () => new Map(graphPaths.map((path) => [path.id, path.label])),
    [graphPaths]
  );
  const runPathKeys = useMemo(() => new Set(runs.map((run) => run.pathNodeIds.join('.'))), [runs]);
  const availablePaths = useMemo(
    () => graphPaths.filter((path) => !runPathKeys.has(path.id)),
    [graphPaths, runPathKeys]
  );
  const allowedQueues = useMemo(() => {
    if (computationMode === ComputationMode.local) {
      return [ComputationQueue.local];
    }
    if (computationMode === ComputationMode.cloud) {
      return [ComputationQueue.cloud];
    }
    return [ComputationQueue.local, ComputationQueue.cloud];
  }, [computationMode]);
  const queueLabels = useMemo(
    () =>
      new Map<ComputationQueue, string>([
        [ComputationQueue.local, 'Локальна черга'],
        [ComputationQueue.cloud, 'Хмарна черга'],
      ]),
    []
  );
  const resolvePathLabel = (nodeIds: string[]) =>
    pathLabels.get(nodeIds.join('.')) ?? nodeIds.join(' -> ');
  const getRunMeta = (run: (typeof runs)[number]) => {
    const timeLabel = formatTimeAgo(String(run.updatedAt ?? run.createdAt));
    const progressLabel = typeof run.progress === 'number' ? ` • ${Math.round(run.progress)}%` : '';
    return `${timeLabel} • ${run.pathNodeIds.length} вузлів${progressLabel}`;
  };

  useEffect(() => {
    if (selectedPathId === 'all') return;
    if (graphPathMap.has(selectedPathId)) return;
    setSelectedPathId('all');
  }, [graphPathMap, selectedPathId]);

  useEffect(() => {
    if (allowedQueues.includes(queue)) return;
    setQueue(allowedQueues[0] ?? ComputationQueue.local);
  }, [allowedQueues, queue]);

  useEffect(() => {
    setEnqueueStatus(null);
  }, [queue, selectedPathId]);

  const handleCloseModal = () => {
    setEditModalOpen(false);
    setUploadError(null);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleEnqueueRuns = async () => {
    if (!experiment) return;
    if (!graph || graphPaths.length === 0) {
      setEnqueueStatus('Спочатку згенеруйте граф і оберіть шлях.');
      return;
    }

    const isAll = selectedPathId === 'all';
    const selectedPath = isAll ? null : graphPathMap.get(selectedPathId);
    if (!isAll && !selectedPath) {
      setEnqueueStatus('Оберіть шлях для запуску.');
      return;
    }
    if (isAll && availablePaths.length === 0) {
      setEnqueueStatus('Усі шляхи вже мають обчислення.');
      return;
    }
    if (!isAll && selectedPath && runPathKeys.has(selectedPath.id)) {
      setEnqueueStatus('Цей шлях уже має обчислення.');
      return;
    }

    try {
      const result = await enqueueRuns({
        variables: {
          input: {
            experimentId: experiment._id,
            queue,
            runAll: isAll ? true : undefined,
            pathNodeIds: !isAll ? selectedPath?.nodeIds : undefined,
          },
        },
      });
      const created = result.data?.enqueueExperimentRuns ?? [];
      const queueLabel = queue === ComputationQueue.cloud ? 'хмарну' : 'локальну';
      setEnqueueStatus(`Додано в ${queueLabel} чергу: ${created.length}.`);
      await refetchRuns();
    } catch (_err) {
      // Error state is handled by enqueueError.
    }
  };

  const isAllSelected = selectedPathId === 'all';
  const selectedPath = isAllSelected ? null : (graphPathMap.get(selectedPathId) ?? null);
  const selectedPathHasRun = selectedPath ? runPathKeys.has(selectedPath.id) : false;
  const canEnqueue =
    Boolean(experiment && graph && graphPaths.length > 0) &&
    (isAllSelected ? availablePaths.length > 0 : Boolean(selectedPath && !selectedPathHasRun));
  const localQueueLabel = 'Локальна черга';
  const cloudQueueLabel = 'Хмарна черга';

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

          <section className="card data-card">
            <header className="card-head">
              <div>
                <h3>Запуск обчислень</h3>
                <p className="muted">Запустіть один шлях або всі — у локальну чи хмарну чергу.</p>
              </div>
            </header>
            {!graph && <p className="muted">Граф ще не створений для запуску обчислень.</p>}
            {graph && (
              <>
                <div className="item-list">
                  <div className="form-group">
                    <label htmlFor="path-select">Шлях</label>
                    <select
                      id="path-select"
                      value={selectedPathId}
                      onChange={(event) => setSelectedPathId(event.target.value)}
                      disabled={graphPaths.length === 0 || enqueueing}
                    >
                      <option value="all">Усі шляхи ({graphPaths.length})</option>
                      {graphPaths.map((path, index) => (
                        <option key={path.id} value={path.id}>
                          {`Шлях ${index + 1}: ${path.label}`}
                        </option>
                      ))}
                    </select>
                    {graphPaths.length === 0 && (
                      <p className="muted small">Немає доступних шляхів у графі.</p>
                    )}
                  </div>
                  <div className="form-group">
                    <label htmlFor="queue-select">Черга</label>
                    <select
                      id="queue-select"
                      value={queue}
                      onChange={(event) => setQueue(event.target.value as ComputationQueue)}
                      disabled={enqueueing || allowedQueues.length === 1}
                    >
                      {allowedQueues.map((value) => (
                        <option key={value} value={value}>
                          {queueLabels.get(value) ?? value}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="actions">
                    <button
                      className="btn primary"
                      type="button"
                      onClick={() => void handleEnqueueRuns()}
                      disabled={!canEnqueue || enqueueing}
                    >
                      {enqueueing
                        ? 'Запуск...'
                        : isAllSelected
                          ? 'Запустити всі'
                          : 'Запустити шлях'}
                    </button>
                  </div>
                  {enqueueError && <p className="error">Помилка запуску: {enqueueError.message}</p>}
                  {enqueueStatus && <p className="muted small">{enqueueStatus}</p>}
                </div>

                <div className="graph-summary">
                  <div className="graph-summary-grid">
                    <div className="graph-summary-item">
                      <span className="muted small">{localQueueLabel}</span>
                      <span className="graph-summary-value">
                        {runsLoading ? '...' : localRuns.length}
                      </span>
                    </div>
                    <div className="graph-summary-item">
                      <span className="muted small">{cloudQueueLabel}</span>
                      <span className="graph-summary-value">
                        {runsLoading ? '...' : cloudRuns.length}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="data-grid">
                  <div>
                    <div className="form-divider">{localQueueLabel}</div>
                    <div className="item-list">
                      {runsLoading && localRuns.length === 0 && (
                        <p className="muted">Завантаження черги...</p>
                      )}
                      {runsError && <p className="error">Помилка черги: {runsError.message}</p>}
                      {!runsLoading && !runsError && localRuns.length === 0 && (
                        <p className="muted">Локальна черга порожня.</p>
                      )}
                      {localRuns.map((run) => (
                        <div key={run._id} className="item-row">
                          <div className="item-meta">
                            <p className="item-title">{resolvePathLabel(run.pathNodeIds)}</p>
                            <p className="muted">{getRunMeta(run)}</p>
                            {run.statusMessage && (
                              <p className="muted small">{run.statusMessage}</p>
                            )}
                          </div>
                          <span className={`status-pill status-${run.status}`}>
                            {runStatusLabels[run.status] ?? run.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="form-divider">{cloudQueueLabel}</div>
                    <div className="item-list">
                      {runsLoading && cloudRuns.length === 0 && (
                        <p className="muted">Завантаження черги...</p>
                      )}
                      {runsError && <p className="error">Помилка черги: {runsError.message}</p>}
                      {!runsLoading && !runsError && cloudRuns.length === 0 && (
                        <p className="muted">Хмарна черга порожня.</p>
                      )}
                      {cloudRuns.map((run) => (
                        <div key={run._id} className="item-row">
                          <div className="item-meta">
                            <p className="item-title">{resolvePathLabel(run.pathNodeIds)}</p>
                            <p className="muted">{getRunMeta(run)}</p>
                            {run.statusMessage && (
                              <p className="muted small">{run.statusMessage}</p>
                            )}
                          </div>
                          <span className={`status-pill status-${run.status}`}>
                            {runStatusLabels[run.status] ?? run.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>
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
    </AuthLayout>
  );
}

export default ExperimentDetailsPage;
