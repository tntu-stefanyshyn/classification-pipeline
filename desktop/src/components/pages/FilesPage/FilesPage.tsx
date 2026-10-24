import { useCallback, useMemo, useRef, useState, type FC, ChangeEvent } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { AuthLayout } from '../../layout/AuthLayout';
import { FileInput } from '../../inputs/FileInput';
import { DataTable } from '../../ui/DataTable';
import { Modal } from '../../ui/Modal';
import { isCsvFile } from '../../../utils/fileValidation';
import {
  useCreateUploadedFileMutation,
  useDeleteUploadedFileMutation,
  useSignedUploadUrlLazyQuery,
  useUploadedFileUsageLazyQuery,
  useUploadedFilesQuery,
} from './graphql';
import type { FileRow, FilesPageProps, PendingDelete } from './FilesPage.types';
import { formatTimeAgo } from './utils/formatTimeAgo';
import { useI18n } from '../../../i18n';

const FilesPage: FC<FilesPageProps> = ({ onLogout }) => {
  const { locale, messages } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const { data, loading, error, refetch } = useUploadedFilesQuery({
    fetchPolicy: 'cache-and-network',
  });
  const [getSignedUrl] = useSignedUploadUrlLazyQuery();
  const [createFile] = useCreateUploadedFileMutation();
  const [deleteFile, { loading: deleting }] = useDeleteUploadedFileMutation();
  // Usage changes whenever experiments attach the file, so never answer from the cache.
  const [getFileUsage, { loading: checkingUsage }] = useUploadedFileUsageLazyQuery({
    fetchPolicy: 'network-only',
  });

  const files = data?.uploadedFiles ?? [];
  const totalSize = useMemo(() => files.reduce((sum, file) => sum + file.sizeMb, 0), [files]);
  const emptyMessage = loading ? messages.filesPage.loading : messages.filesPage.empty;

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

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
      await createFile({
        variables: {
          input: {
            filename: file.name,
            storageKey,
            sizeMb,
          },
        },
      });

      await refetch();
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

  const handleDelete = useCallback(
    async (file: FileRow) => {
      setUploadError(null);
      try {
        const { data: usageData, error: usageError } = await getFileUsage({
          variables: { _id: file._id },
        });
        const usage = usageData?.uploadedFileUsage;
        if (!usage) throw usageError ?? new Error(messages.filesPage.deleteUnknown);
        setPendingDelete({ file, usage });
      } catch (usageErr) {
        setUploadError(
          usageErr instanceof Error ? usageErr.message : messages.filesPage.deleteUnknown
        );
      }
    },
    [getFileUsage, messages.filesPage.deleteUnknown]
  );

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    try {
      // The reviewed experiments are the confirmation; the backend rejects the delete if
      // the file started being used elsewhere in the meantime.
      await deleteFile({
        variables: {
          _id: pendingDelete.file._id,
          detachExperimentIds: pendingDelete.usage.experiments.map((experiment) => experiment._id),
        },
      });
      await refetch();
    } catch (deleteErr) {
      setUploadError(
        deleteErr instanceof Error ? deleteErr.message : messages.filesPage.deleteUnknown
      );
    } finally {
      setPendingDelete(null);
    }
  }, [deleteFile, messages.filesPage.deleteUnknown, pendingDelete, refetch]);

  const columns = useMemo<ColumnDef<FileRow>[]>(
    () => [
      {
        header: messages.filesPage.columns.file,
        accessorKey: 'filename',
        cell: (info) => <span className="item-title">{info.getValue<string>()}</span>,
      },
      {
        header: messages.filesPage.columns.size,
        accessorKey: 'sizeMb',
        cell: (info) => (
          <span className="cell-number">
            {info.getValue<number>()} {messages.filesPage.mb}
          </span>
        ),
      },
      {
        header: messages.filesPage.columns.uploaded,
        accessorKey: 'uploadedAt',
        cell: (info) => {
          const value = info.getValue<string | Date>();
          return <span className="muted">{formatTimeAgo(value, locale)}</span>;
        },
      },
      {
        header: messages.filesPage.columns.status,
        accessorKey: 'status',
        cell: (info) => {
          const status = info.getValue<string>();
          return (
            <span className={`status-pill status-${status}`}>
              {messages.statuses.fileStatus[status as keyof typeof messages.statuses.fileStatus] ??
                status}
            </span>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="table-actions">
            <button
              className="btn ghost small icon"
              type="button"
              onClick={() => handleDelete(row.original)}
              disabled={deleting || checkingUsage}
              aria-label={messages.filesPage.columns.delete}
              title={messages.filesPage.columns.delete}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path
                  d="M3 6h18"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.6"
                />
                <path
                  d="M8 6V4h8v2"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.6"
                />
                <path
                  d="M6 6l1 14h10l1-14"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.6"
                />
                <path
                  d="M10 10v6"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.6"
                />
                <path
                  d="M14 10v6"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.6"
                />
              </svg>
            </button>
          </div>
        ),
      },
    ],
    [
      checkingUsage,
      deleting,
      handleDelete,
      locale,
      messages.filesPage,
      messages.statuses.fileStatus,
    ]
  );

  return (
    <AuthLayout
      badge={messages.filesPage.badge}
      title={messages.filesPage.title}
      subtitle={messages.filesPage.subtitle}
      onLogout={onLogout}
      actions={
        <div className="actions">
          <button
            className="btn primary"
            type="button"
            onClick={handleUploadClick}
            disabled={uploading}
          >
            {uploading ? messages.common.loading : messages.filesPage.upload}
          </button>
          <button className="btn ghost" type="button" onClick={() => refetch()} disabled={loading}>
            {messages.filesPage.refresh}
          </button>
        </div>
      }
    >
      <FileInput ref={fileInputRef} accept=".csv,text/csv" onChange={handleFileChange} />

      <div className="stat-grid">
        <article className="card stat-card">
          <p className="muted">{messages.filesPage.totalFiles}</p>
          <div className="stat-value">{files.length}</div>
          <p className="stat-hint">{messages.filesPage.totalFilesHint}</p>
        </article>
        <article className="card stat-card">
          <p className="muted">{messages.filesPage.totalSize}</p>
          <div className="stat-value">
            {totalSize} {messages.filesPage.mb}
          </div>
          <p className="stat-hint">{messages.filesPage.totalSizeHint}</p>
        </article>
      </div>

      <section className="card data-card">
        <header className="card-head">
          <div>
            <h3>{messages.filesPage.uploadedFilesTitle}</h3>
            <p className="muted">{messages.filesPage.uploadedFilesSubtitle}</p>
          </div>
        </header>
        <div className="table-status">
          {error && (
            <p className="error">
              {messages.common.errorPrefix}: {error.message}
            </p>
          )}
          {uploadError && <p className="error">{uploadError}</p>}
        </div>
        <DataTable
          data={files}
          columns={columns}
          emptyMessage={emptyMessage}
          pageSize={5}
          pageSizeOptions={[5, 10, 20]}
          getRowId={(row) => row._id}
        />
      </section>

      <Modal
        open={pendingDelete !== null}
        title={messages.filesPage.deleteTitle}
        onClose={() => setPendingDelete(null)}
        footer={
          <div className="actions">
            <button className="btn ghost" type="button" onClick={() => setPendingDelete(null)}>
              {messages.common.cancel}
            </button>
            <button
              className="btn primary"
              type="button"
              onClick={confirmDelete}
              disabled={deleting || Boolean(pendingDelete?.usage.blocked)}
            >
              {deleting ? messages.common.loading : messages.filesPage.deleteAction}
            </button>
          </div>
        }
      >
        {pendingDelete && (
          <>
            <p>{messages.filesPage.deleteConfirm(pendingDelete.file.filename)}</p>
            {pendingDelete.usage.blocked ? (
              <p className="error">{messages.filesPage.deleteBlocked}</p>
            ) : (
              pendingDelete.usage.experiments.length > 0 && (
                <p>{messages.filesPage.deleteDetachWarning}</p>
              )
            )}
            {pendingDelete.usage.experiments.length > 0 && (
              <ul>
                {pendingDelete.usage.experiments.map((experiment) => (
                  <li key={experiment._id}>
                    {experiment.name} — {messages.statuses.experimentStatus[experiment.status]}
                    {experiment.blocking && ` (${messages.filesPage.deleteBlockingLabel})`}
                  </li>
                ))}
              </ul>
            )}
            {pendingDelete.usage.otherExperimentsCount > 0 && (
              <p className="muted">
                {messages.filesPage.deleteOtherExperiments(
                  pendingDelete.usage.otherExperimentsCount
                )}
              </p>
            )}
          </>
        )}
      </Modal>
    </AuthLayout>
  );
};

export default FilesPage;
