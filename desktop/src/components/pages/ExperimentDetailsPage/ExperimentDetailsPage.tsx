import { Link, useParams } from 'react-router-dom';
import { Form, Formik } from 'formik';
import { useMemo, useRef, useState, type FC, type ChangeEvent } from 'react';
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
import { createValidationSchema } from './constants/validationSchema';
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
import OptimizationCard from '../../experiments/OptimizationCard/OptimizationCard';
import ChangeExperimentStatusButton from '../../experiments/ChangeExperimentStatusButton/ChangeExperimentStatusButton';
import { useI18n } from '../../../i18n';

const ExperimentDetailsPage: FC<ExperimentDetailsPageProps> = ({ onLogout }) => {
  const { locale, messages } = useI18n();
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
  const validationSchema = useMemo(() => createValidationSchema(), [messages.experimentsPage]);

  const experiment = data?.experiment;
  const uploadedFiles = uploadedFilesData?.uploadedFiles ?? [];
  const graph = experiment?.graph;
  const graphSettings = graph?.settings ?? null;
  const graphPaths = useMemo(() => buildGraphPaths(graph?.nodes ?? [], locale), [graph, locale]);
  const isExperimentLocked =
    experiment?.status === ExperimentStatus.computing ||
    experiment?.status === ExperimentStatus.optimization ||
    experiment?.status === ExperimentStatus.completed;
  const hasDatasetFile = Boolean(experiment?.fileId);
  const canEditExperiment = Boolean(experiment) && (!isExperimentLocked || !hasDatasetFile);

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
  const canMoveToComputing =
    experiment?.status === ExperimentStatus.configuring && graphSettingsReady && hasDatasetFile;

  const reportUrl = useMemo(() => {
    if (!experiment) return '';
    const baseUrl = config.renderer.graphqlEndpoint.replace(/\/graphql\/?$/, '');
    return `${baseUrl}/experiments/${experiment._id}/report`;
  }, [experiment]);

  const handleCloseModal = () => {
    setEditModalOpen(false);
    setUploadError(null);
  };

  const handleSaveGraphSettings = async (settings: GraphStructureSettingsInput) => {
    if (!experiment || isExperimentLocked) return;
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
      setSettingsModalOpen(false);
    } catch (_err) {
      // Error state is handled by settingsUpdateError.
    }
  };

  const localQueueLabel = messages.statuses.computationQueue.local;
  const cloudQueueLabel = messages.statuses.computationQueue.cloud;
  const settingsQueueLabel = graphSettings?.queues?.length
    ? graphSettings.queues
        .map((queueType) =>
          queueType === ComputationQueue.cloud ? cloudQueueLabel : localQueueLabel
        )
        .join(', ')
    : messages.common.notConfigured;
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

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <AuthLayout
      badge={messages.experimentDetails.badge}
      title={experiment?.name ?? messages.experimentDetails.fallbackTitle}
      subtitle={experiment?.description || messages.experimentDetails.descriptionMissing}
      onLogout={onLogout}
      actions={
        <>
          <button className="btn ghost" type="button" onClick={() => refetch()} disabled={loading}>
            {messages.experimentDetails.refresh}
          </button>
          {experiment?.status === ExperimentStatus.completed ? (
            <a
              className="btn ghost"
              href={reportUrl}
              download={`experiment-${experiment._id}-report.pdf`}
            >
              {messages.common.downloadPdf}
            </a>
          ) : null}
          <button
            className="btn primary"
            type="button"
            onClick={() => setEditModalOpen(true)}
            disabled={!canEditExperiment}
          >
            {isExperimentLocked && !hasDatasetFile
              ? messages.experimentDetails.addFile
              : messages.experimentDetails.edit}
          </button>
        </>
      }
    >
      {!id && <p className="error">{messages.experimentDetails.missingId}</p>}
      {loading && !experiment && <p className="muted">{messages.experimentDetails.loading}</p>}
      {error && (
        <p className="error">
          {messages.common.errorPrefix}: {error.message}
        </p>
      )}
      {!loading && !error && !experiment && (
        <p className="error">{messages.experimentDetails.notFound}</p>
      )}

      {experiment && (
        <div className="dashboard">
          <section className="card data-card">
            <header className="card-head" style={{ alignItems: 'flex-start' }}>
              <h3>{messages.experimentDetails.detailsTitle}</h3>
              <span className={`status-pill status-${experiment.status}`}>
                {messages.statuses.experimentStatus[experiment.status!] ?? experiment.status}
              </span>
            </header>
            <div className="experiment-detail-list">
              <div className="experiment-detail-row">
                <span className="experiment-detail-label">
                  {messages.experimentDetails.created}
                </span>
                <div className="experiment-detail-value-block">
                  <span className="experiment-detail-value">
                    {formatTimeAgo(String(experiment.createdAt), locale)}
                  </span>
                  <span className="muted small">
                    {messages.experimentDetails.date}:{' '}
                    {new Date(experiment.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="experiment-detail-row">
                <span className="experiment-detail-label">
                  {messages.experimentDetails.eegFile}
                </span>
                <div className="experiment-detail-value-block">
                  {filesLoading ? (
                    <span className="muted small">{messages.experimentDetails.fileLoading}</span>
                  ) : filesError ? (
                    <span className="error small">
                      {messages.experimentDetails.fileError}: {filesError.message}
                    </span>
                  ) : datasetFile ? (
                    <>
                      <span className="experiment-detail-value">{datasetFile.filename}</span>
                      <span className="muted small">
                        {messages.experimentDetails.fileSize}: {datasetFile.sizeMb}{' '}
                        {messages.filesPage.mb}
                      </span>
                    </>
                  ) : (
                    <span className="muted small">{messages.experimentDetails.fileMissing}</span>
                  )}
                </div>
              </div>
            </div>
          </section>
          <section className="card data-card">
            <header className="card-head">
              <div>
                <h3>{messages.experimentDetails.graphSettingsTitle}</h3>
                <p className="muted">{messages.experimentDetails.graphSettingsSubtitle}</p>
              </div>
            </header>
            <div style={{ display: 'flex', justifyContent: 'end', gap: '0.75rem' }}>
              <ChangeExperimentStatusButton
                label={messages.experimentDetails.toComputing}
                status={ExperimentStatus.computing}
                disabled={!canMoveToComputing}
              />
              {experiment ? (
                <Link className="btn ghost" to={`/app/experiments/${experiment._id}/constructor`}>
                  {messages.experimentDetails.constructor}
                </Link>
              ) : null}
              <button
                className="btn ghost small"
                type="button"
                onClick={() => setSettingsModalOpen(true)}
                disabled={!experiment}
              >
                {isExperimentLocked
                  ? messages.experimentDetails.viewSettings
                  : messages.experimentDetails.editSettings}
              </button>
            </div>
            {!graphSettingsReady && (
              <Alert variant="warning">{messages.experimentDetails.graphSettingsMissing}</Alert>
            )}
            {!hasDatasetFile && (
              <Alert variant="warning">{messages.experimentDetails.datasetMissing}</Alert>
            )}
            <div className="graph-summary-grid">
              <div className="graph-summary-item">
                <span className="muted small">{messages.experimentDetails.pipelineCount}</span>
                <span className="graph-summary-value">{graphPaths.length}</span>
              </div>
              <div className="graph-summary-item">
                <span className="muted small">{messages.experimentDetails.selectedQueues}</span>
                <span className="graph-settings-value">{settingsQueueLabel}</span>
              </div>
            </div>
            <div className="graph-summary-item">
              <span className="muted small">{messages.experimentDetails.folds}</span>
              <span className="graph-settings-value">{graphSettings?.folds}</span>
            </div>
            <div className="graph-summary-item">
              <span className="muted small">{messages.experimentDetails.optimizationMinutes}</span>
              <span className="graph-settings-value">
                {graphSettings?.hyperOptimizationMinutesPerPipeline
                  ? `${graphSettings.hyperOptimizationMinutesPerPipeline} ${messages.experimentDetails.minutesShort}`
                  : '—'}
              </span>
            </div>
            <div className="graph-summary-item">
              <span className="muted small">{messages.experimentDetails.predictPercent}</span>
              <span className="graph-settings-value">
                {`${graphSettings?.predictDataPercent ?? 20}%`}
              </span>
            </div>
            <div>
              <div className="form-divider">{messages.experimentDetails.metricWeights}</div>
              {metricsSummary.length > 0 ? (
                <ul className="graph-list">
                  {metricsSummary.map((metric) => {
                    const formatted = formatWeightPercent(metric.value);
                    return (
                      <li key={metric.key}>
                        {messages.metrics[metric.key as keyof typeof messages.metrics] ??
                          metric.key}
                        : {formatted ? `${formatted}%` : '—'}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="muted small">{messages.experimentDetails.metricsMissing}</p>
              )}
            </div>
          </section>

          <ComputationCard />
          <OptimizationCard />
        </div>
      )}

      <GraphSettingsModal
        open={settingsModalOpen}
        settings={graphSettings}
        onClose={() => setSettingsModalOpen(false)}
        onSave={handleSaveGraphSettings}
        isBusy={settingsUpdating}
        isLocked={isExperimentLocked}
        errorMessage={settingsUpdateError?.message ?? null}
      />

      <Modal
        open={isEditModalOpen}
        title={messages.experimentDetails.editTitle}
        onClose={handleCloseModal}
      >
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
              if (isExperimentLocked && !normalizedFileId) {
                setStatus(messages.experimentDetails.datasetMissing);
                return;
              }
              const input = isExperimentLocked
                ? {
                    _id: experiment._id,
                    fileId: normalizedFileId,
                  }
                : {
                    _id: experiment._id,
                    name: values.name.trim(),
                    description: values.description.trim() || null,
                    fileId: normalizedFileId,
                  };
              await updateExperiment({
                variables: { input },
                refetchQueries: [refetchExperimentQuery({ _id: experiment._id })],
                awaitRefetchQueries: true,
              });
              handleCloseModal();
            } catch (_err) {
              setStatus(messages.experimentDetails.updateFailed);
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
                setUploadError(messages.filesPage.onlyCsv);
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
                  throw new Error(messages.filesPage.uploadDataFailed);
                }

                const uploadResponse = await fetch(signedUrl, {
                  method: 'PUT',
                  body: file,
                  headers: { 'Content-Type': file.type },
                });

                if (!uploadResponse.ok) {
                  throw new Error(messages.filesPage.uploadFailed);
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
                  uploadErr instanceof Error ? uploadErr.message : messages.filesPage.uploadUnknown
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
                <InputField
                  name="name"
                  label={messages.experimentDetails.nameLabel}
                  disabled={isExperimentLocked}
                />
                <TextAreaField
                  name="description"
                  label={messages.experimentDetails.descriptionLabel}
                  placeholder={messages.experimentDetails.descriptionPlaceholder}
                  disabled={isExperimentLocked}
                />
                <div className="form-group">
                  <label htmlFor="fileId">{messages.experimentDetails.fileLabel}</label>
                  <select
                    id="fileId"
                    name="fileId"
                    value={values.fileId}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    disabled={filesLoading || uploading || (isExperimentLocked && hasDatasetFile)}
                  >
                    <option value="">{messages.experimentDetails.noFile}</option>
                    {uploadedFiles.map((file) => (
                      <option key={file._id} value={file._id}>
                        {file.filename}
                      </option>
                    ))}
                  </select>
                  <p className="muted small">{messages.experimentDetails.fileHint}</p>
                  <div className="file-actions">
                    <button
                      className="btn ghost small"
                      type="button"
                      onClick={handleUploadClick}
                      disabled={uploading || (isExperimentLocked && hasDatasetFile)}
                    >
                      {uploading ? messages.common.loading : messages.experimentDetails.upload}
                    </button>
                    {filesLoading && (
                      <span className="muted small">{messages.experimentDetails.filesLoading}</span>
                    )}
                  </div>
                  {filesError && (
                    <p className="error">
                      {messages.experimentDetails.fileError}: {filesError.message}
                    </p>
                  )}
                  {uploadError && <p className="error">{uploadError}</p>}
                </div>
                <FileInput
                  ref={fileInputRef}
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  disabled={isExperimentLocked && hasDatasetFile}
                />
                {status && <p className="error">{status}</p>}
                {updateError && (
                  <p className="error">
                    {messages.common.errorPrefix}: {updateError.message}
                  </p>
                )}
                <div className="actions">
                  <button className="btn ghost" type="button" onClick={handleCloseModal}>
                    {messages.common.cancel}
                  </button>
                  <button
                    className="btn primary"
                    type="submit"
                    disabled={isSubmitting || updating || (isExperimentLocked && hasDatasetFile)}
                  >
                    {isSubmitting || updating
                      ? messages.experimentDetails.saving
                      : messages.experimentDetails.saveChanges}
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
