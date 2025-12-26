import { Link, useParams } from 'react-router-dom';
import { Form, Formik } from 'formik';
import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { AuthLayout } from '../../../components/layout/AuthLayout/AuthLayout';
import { Modal } from '../../../components/ui/Modal/Modal';
import { isCsvFile } from '../../../utils/fileValidation';
import { validationSchema } from './constants/validationSchema';
import {
  refetchExperimentQuery,
  useCreateUploadedFileMutation,
  useExperimentQuery,
  useSignedUploadUrlLazyQuery,
  useUpdateExperimentMutation,
  useUploadedFilesQuery,
} from './graphql';
import type { ExperimentDetailsPageProps } from './ExperimentDetailsPage.types';
import { countGraphPaths } from './utils/countGraphPaths';
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

  const experiment = data?.experiment;
  const uploadedFiles = uploadedFilesData?.uploadedFiles ?? [];
  const graph = experiment?.graph;
  const pathsCount = useMemo(() => countGraphPaths(graph?.nodes ?? []), [graph]);

  const handleCloseModal = () => {
    setEditModalOpen(false);
    setUploadError(null);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

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
                <h3>Графова структура</h3>
                <p className="muted">Поточна кількість шляхів у графі.</p>
              </div>
              {graph ? (
                <Link
                  className="btn primary small"
                  to={`/app/experiments/${experiment._id}/constructor`}
                >
                  Відкрити конструктор
                </Link>
              ) : null}
            </header>
            {!graph && <p className="muted">Граф ще не створений.</p>}
            {graph && (
              <div className="graph-summary">
                <div className="graph-summary-grid">
                  <div className="graph-summary-item">
                    <span className="muted small">Кількість шляхів</span>
                    <span className="graph-summary-value">{pathsCount}</span>
                  </div>
                </div>
              </div>
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
