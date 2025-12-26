import { Form, Formik } from 'formik';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../../../components/layout/AuthLayout/AuthLayout';
import { DataTable } from '../../../components/ui/DataTable/DataTable';
import { Modal } from '../../../components/ui/Modal/Modal';
import { isCsvFile } from '../../../utils/fileValidation';
import { TextAreaField } from './components/TextAreaField/TextAreaField';
import { TextInputField } from './components/TextInputField/TextInputField';
import { experimentSchema } from './constants/experimentSchema';
import { statusLabels } from './constants/statusLabels';
import { tableLabels } from './constants/tableLabels';
import {
  refetchDashboardDataQuery,
  refetchExperimentsQuery,
  useCreateExperimentMutation,
  useCreateUploadedFileMutation,
  useExperimentsQuery,
  useSignedUploadUrlLazyQuery,
  useUploadedFilesQuery,
} from './graphql';
import type {
  ExperimentFormValues,
  ExperimentRow,
  ExperimentsPageProps,
} from './ExperimentsPage.types';
import { formatTimeAgo } from './utils/formatTimeAgo';

export function ExperimentsPage({ onLogout }: ExperimentsPageProps) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { data, loading, error, refetch } = useExperimentsQuery({
    fetchPolicy: 'cache-and-network',
  });
  const [createExperiment, { loading: creating, error: creationError }] =
    useCreateExperimentMutation();
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
  const [isModalOpen, setModalOpen] = useState(false);

  // Keep dashboard stats fresh when a new experiment is created.
  const refetchQueries = useMemo(
    () => [refetchExperimentsQuery(), refetchDashboardDataQuery()],
    []
  );

  const experiments = data?.experiments ?? [];
  const uploadedFiles = uploadedFilesData?.uploadedFiles ?? [];
  const emptyMessage = loading ? 'Завантаження експериментів...' : 'Експерименти ще не додані.';

  const columns = useMemo<ColumnDef<ExperimentRow>[]>(
    () => [
      {
        header: 'Експеримент',
        accessorKey: 'name',
        cell: ({ row, getValue }) => (
          <div className="table-stack">
            <Link to={`/app/experiments/${row.original._id}`} className="table-link item-title">
              {getValue<string>()}
            </Link>
            <span className="muted small">{row.original.description || 'Опис не додано'}</span>
          </div>
        ),
      },
      {
        header: 'Статус',
        accessorKey: 'status',
        cell: (info) => {
          const status = info.getValue<string>();
          return (
            <span className={`status-pill status-${status}`}>{statusLabels[status] ?? status}</span>
          );
        },
      },
      {
        header: 'Створено',
        accessorKey: 'createdAt',
        cell: (info) => (
          <span className="muted">{formatTimeAgo(info.getValue<string | Date>())}</span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="table-actions">
            <Link
              to={`/app/experiments/${row.original._id}`}
              className="btn ghost small icon"
              aria-label="Відкрити"
              title="Відкрити"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path
                  d="M5 12h14"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.6"
                />
                <path
                  d="M13 6l6 6-6 6"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.6"
                />
              </svg>
            </Link>
          </div>
        ),
      },
    ],
    []
  );

  const handleRowClick = useCallback(
    (row: ExperimentRow) => {
      navigate(`/app/experiments/${row._id}`);
    },
    [navigate]
  );

  const handleCloseModal = () => {
    setModalOpen(false);
    setUploadError(null);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <AuthLayout
      badge="Авторизований доступ"
      title="Експерименти"
      subtitle="Переглядайте статуси та створюйте нові експерименти."
      onLogout={onLogout}
      actions={
        <>
          <button className="btn ghost" type="button" onClick={() => refetch()} disabled={loading}>
            Оновити
          </button>
          <button className="btn primary" type="button" onClick={() => setModalOpen(true)}>
            Створити експеримент
          </button>
        </>
      }
    >
      <div className="data-grid">
        <section className="card data-card">
          <header className="card-head">
            <div>
              <h3>Активні експерименти</h3>
              <p className="muted">Статуси та час створення.</p>
            </div>
          </header>
          <div className="table-status">
            {error && <p className="error">Помилка: {error.message}</p>}
          </div>
          <DataTable
            data={experiments}
            columns={columns}
            emptyMessage={emptyMessage}
            labels={tableLabels}
            pageSize={6}
            pageSizeOptions={[6, 12, 24]}
            getRowId={(row) => row._id}
            onRowClick={handleRowClick}
          />
        </section>
      </div>

      <Modal open={isModalOpen} title="Створити експеримент" onClose={handleCloseModal}>
        <Formik<ExperimentFormValues>
          initialValues={{ name: '', description: '', fileId: '' }}
          validationSchema={experimentSchema}
          onSubmit={async (values, { resetForm, setStatus, setSubmitting }) => {
            setStatus(undefined);
            const trimmedName = values.name.trim();
            const trimmedDescription = values.description?.trim() ?? '';
            const normalizedFileId = values.fileId.trim() || null;

            try {
              await createExperiment({
                variables: {
                  input: {
                    name: trimmedName,
                    description: trimmedDescription || null,
                    fileId: normalizedFileId,
                  },
                },
                refetchQueries,
                awaitRefetchQueries: true,
              });
              resetForm();
              handleCloseModal();
            } catch (_error) {
              setStatus('Не вдалося створити експеримент. Спробуйте ще раз.');
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {({ values, handleChange, handleBlur, setFieldValue, isSubmitting, status }) => {
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
                <TextInputField
                  name="name"
                  label="Назва експерименту"
                  placeholder="Наприклад, Protein baseline"
                />
                <TextAreaField
                  name="description"
                  label="Опис"
                  placeholder="Коротко опишіть цілі експерименту"
                />
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
                {creationError && <p className="error">Помилка: {creationError.message}</p>}

                <div className="actions">
                  <button className="btn ghost" type="button" onClick={handleCloseModal}>
                    Скасувати
                  </button>
                  <button className="btn primary" type="submit" disabled={creating || isSubmitting}>
                    {creating || isSubmitting ? 'Створення...' : 'Створити експеримент'}
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

export default ExperimentsPage;
