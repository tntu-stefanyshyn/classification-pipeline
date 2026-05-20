import { Form, Formik } from 'formik';
import { useCallback, useMemo, useRef, useState, type FC } from 'react';
import type { ChangeEvent } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../../layout/AuthLayout';
import { FileInput } from '../../inputs/FileInput';
import { DataTable } from '../../ui/DataTable';
import { Modal } from '../../ui/Modal';
import { isCsvFile } from '../../../utils/fileValidation';
import { InputField } from '../../inputs/InputField';
import { TextAreaField } from '../../inputs/TextAreaField';
import { createExperimentSchema } from './constants/experimentSchema';
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
import { useI18n } from '../../../i18n';

const ExperimentsPage: FC<ExperimentsPageProps> = ({ onLogout }) => {
  const { locale, messages } = useI18n();
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

  const validationSchema = useMemo(() => createExperimentSchema(), [messages.experimentsPage]);
  const refetchQueries = useMemo(
    () => [refetchExperimentsQuery(), refetchDashboardDataQuery()],
    []
  );

  const experiments = data?.experiments ?? [];
  const uploadedFiles = uploadedFilesData?.uploadedFiles ?? [];
  const emptyMessage = loading ? messages.experimentsPage.loading : messages.experimentsPage.empty;

  const columns = useMemo<ColumnDef<ExperimentRow>[]>(
    () => [
      {
        header: messages.experimentsPage.columns.experiment,
        accessorKey: 'name',
        cell: ({ row, getValue }) => (
          <div className="table-stack">
            <Link to={`/app/experiments/${row.original._id}`} className="table-link item-title">
              {getValue<string>()}
            </Link>
            <span className="muted small">
              {row.original.description || messages.experimentsPage.descriptionMissing}
            </span>
          </div>
        ),
      },
      {
        header: messages.experimentsPage.columns.status,
        accessorKey: 'status',
        cell: (info) => {
          const status = info.getValue<string>();
          return (
            <span className={`status-pill status-${status}`}>
              {messages.statuses.experimentStatus[
                status as keyof typeof messages.statuses.experimentStatus
              ] ?? status}
            </span>
          );
        },
      },
      {
        header: messages.experimentsPage.columns.created,
        accessorKey: 'createdAt',
        cell: (info) => (
          <span className="muted">{formatTimeAgo(info.getValue<string | Date>(), locale)}</span>
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
              aria-label={messages.experimentsPage.columns.open}
              title={messages.experimentsPage.columns.open}
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
    [locale, messages.experimentsPage, messages.statuses.experimentStatus]
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
      badge={messages.experimentsPage.badge}
      title={messages.experimentsPage.title}
      subtitle={messages.experimentsPage.subtitle}
      onLogout={onLogout}
      actions={
        <>
          <button className="btn ghost" type="button" onClick={() => refetch()} disabled={loading}>
            {messages.experimentsPage.refresh}
          </button>
          <button className="btn primary" type="button" onClick={() => setModalOpen(true)}>
            {messages.experimentsPage.create}
          </button>
        </>
      }
    >
      <div className="data-grid">
        <section className="card data-card">
          <header className="card-head">
            <div>
              <h3>{messages.experimentsPage.activeTitle}</h3>
              <p className="muted">{messages.experimentsPage.activeSubtitle}</p>
            </div>
          </header>
          <div className="table-status">
            {error && (
              <p className="error">
                {messages.common.errorPrefix}: {error.message}
              </p>
            )}
          </div>
          <DataTable
            data={experiments}
            columns={columns}
            emptyMessage={emptyMessage}
            pageSize={6}
            pageSizeOptions={[6, 12, 24]}
            getRowId={(row) => row._id}
            onRowClick={handleRowClick}
          />
        </section>
      </div>

      <Modal
        open={isModalOpen}
        title={messages.experimentsPage.createTitle}
        onClose={handleCloseModal}
      >
        <Formik<ExperimentFormValues>
          initialValues={{ name: '', description: '', fileId: '' }}
          validationSchema={validationSchema}
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
              setStatus(messages.experimentsPage.createFailed);
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
                setUploadError(messages.experimentsPage.onlyCsv);
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
                  throw new Error(messages.experimentsPage.uploadDataFailed);
                }

                const uploadResponse = await fetch(signedUrl, {
                  method: 'PUT',
                  body: file,
                  headers: { 'Content-Type': file.type },
                });

                if (!uploadResponse.ok) {
                  throw new Error(messages.experimentsPage.uploadFailed);
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
                  uploadErr instanceof Error
                    ? uploadErr.message
                    : messages.experimentsPage.uploadUnknown
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
                  label={messages.experimentsPage.form.name}
                  placeholder={messages.experimentsPage.form.namePlaceholder}
                />
                <TextAreaField
                  name="description"
                  label={messages.experimentsPage.form.description}
                  placeholder={messages.experimentsPage.form.descriptionPlaceholder}
                />
                <div className="form-group">
                  <label htmlFor="fileId">{messages.experimentDetails.fileLabel}</label>
                  <select
                    id="fileId"
                    name="fileId"
                    value={values.fileId}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    disabled={filesLoading || uploading}
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
                      disabled={uploading}
                    >
                      {uploading ? messages.common.loading : messages.experimentsPage.form.upload}
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
                <FileInput ref={fileInputRef} accept=".csv,text/csv" onChange={handleFileChange} />

                {status && <p className="error">{status}</p>}
                {creationError && (
                  <p className="error">
                    {messages.common.errorPrefix}: {creationError.message}
                  </p>
                )}

                <div className="actions">
                  <button className="btn ghost" type="button" onClick={handleCloseModal}>
                    {messages.common.cancel}
                  </button>
                  <button className="btn primary" type="submit" disabled={creating || isSubmitting}>
                    {creating || isSubmitting
                      ? messages.experimentsPage.form.creating
                      : messages.experimentsPage.form.submit}
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

export default ExperimentsPage;
