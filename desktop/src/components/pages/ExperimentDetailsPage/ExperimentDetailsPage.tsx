import { Link, useParams } from 'react-router-dom';
import { Form, Formik } from 'formik';
import { useMemo, useRef, useState, type FC, ChangeEvent } from 'react';
import { AuthLayout } from '../../layout/AuthLayout';
import { Alert } from '../../ui/Alert';
import { Modal } from '../../ui/Modal';
import { FileInput } from '../../inputs/FileInput';
import { InputField } from '../../inputs/InputField';
import { TextAreaField } from '../../inputs/TextAreaField';
import { GraphSettingsModal } from '../../experiments/GraphSettingsModal';
import { config } from '../../../config/config';
import { isCsvFile } from '../../../utils/fileValidation';
import { formatWeightPercent } from '../../../utils/metricWeights';
import { validationSchema } from './constants/validationSchema';
import { graphMetricLabels } from './constants/statusConfig';
import {
  ExperimentStatus,
  ComputationQueue,
  refetchExperimentQuery,
  useCreateUploadedFileMutation,
  useExperimentQuery,
  useSignedUploadUrlLazyQuery,
  useUpdateExperimentMutation,
  useUploadedFilesQuery,
  type GraphStructureSettingsInput,
} from './graphql';
import type { ExperimentDetailsPageProps } from './ExperimentDetailsPage.types';
import { buildGraphPaths } from './utils/buildGraphPaths';
import { formatTimeAgo } from './utils/formatTimeAgo';
import ComputationCard from '../../experiments/ComputationCard/ComputationCard';
import uk from '../../../i18n/uk';
import ChangeExperimentStatusButton from '../../experiments/ChangeExperimentStatusButton/ChangeExperimentStatusButton';

const ExperimentDetailsPage: FC<ExperimentDetailsPageProps> = ({ onLogout }) => {
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
  const experiment = data?.experiment;
  const uploadedFiles = uploadedFilesData?.uploadedFiles ?? [];
  const graph = experiment?.graph;
  const graphSettings = graph?.settings ?? null;
  const graphPaths = useMemo(() => buildGraphPaths(graph?.nodes ?? []), [graph]);
  const isExperimentLocked =
    experiment?.status === ExperimentStatus.computing ||
    experiment?.status === ExperimentStatus.completed;

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

  const localQueueLabel = 'Локальна черга';
  const cloudQueueLabel = 'Хмарна черга';
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

  const datasetFile = useMemo(() => {
    if (!experiment?.fileId) return null;
    return uploadedFiles.find((file) => file._id === experiment.fileId) ?? null;
  }, [experiment?.fileId, uploadedFiles]);

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
                {uk.experimentStatus[experiment.status!] ?? experiment.status}
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
            </header>
            <div style={{ display: 'flex', justifyContent: 'end', gap: '0.75rem' }}>
              <ChangeExperimentStatusButton
                label="Перейти до обчислень"
                status={ExperimentStatus.computing}
              />
              {experiment ? (
                <Link className="btn ghost" to={`/app/experiments/${experiment._id}/constructor`}>
                  Конструктор
                </Link>
              ) : null}
              <button
                className="btn ghost small"
                type="button"
                onClick={openSettingsModal}
                disabled={!experiment || isExperimentLocked}
              >
                Змінити налаштування
              </button>
            </div>
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
            <div className="graph-summary-item">
              <span className="muted small">Кількість кроків перехресної валідації</span>
              <span className="graph-settings-value">{graphSettings?.folds}</span>
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
          <ComputationCard />
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
};

export default ExperimentDetailsPage;
