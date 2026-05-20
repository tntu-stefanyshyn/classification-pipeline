import { useCallback, useMemo, useRef, useState, type FC, ChangeEvent } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { AuthLayout } from '../../layout/AuthLayout';
import { FileInput } from '../../inputs/FileInput';
import { DataTable } from '../../ui/DataTable';
import { isCsvFile } from '../../../utils/fileValidation';
import {
  useCreateUploadedFileMutation,
  useDeleteUploadedFileMutation,
  useSignedUploadUrlLazyQuery,
  useUploadedFilesQuery,
} from './graphql';
import type { FileRow, FilesPageProps } from './FilesPage.types';
import { formatTimeAgo } from './utils/formatTimeAgo';
import { useI18n } from '../../../i18n';

const FilesPage: FC<FilesPageProps> = ({ onLogout }) => {
  const { locale, messages } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { data, loading, error, refetch } = useUploadedFilesQuery({
    fetchPolicy: 'cache-and-network',
  });
  const [getSignedUrl] = useSignedUploadUrlLazyQuery();
  const [createFile] = useCreateUploadedFileMutation();
  const [deleteFile, { loading: deleting }] = useDeleteUploadedFileMutation();

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
    async (_id: string) => {
      if (!window.confirm(messages.filesPage.deleteConfirm)) return;
      try {
        await deleteFile({ variables: { _id } });
        await refetch();
      } catch (deleteErr) {
        setUploadError(
          deleteErr instanceof Error ? deleteErr.message : messages.filesPage.deleteUnknown
        );
      }
    },
    [deleteFile, messages.filesPage.deleteConfirm, messages.filesPage.deleteUnknown, refetch]
  );

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
              onClick={() => handleDelete(row.original._id)}
              disabled={deleting}
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
    [deleting, handleDelete, locale, messages.filesPage, messages.statuses.fileStatus]
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
    </AuthLayout>
  );
};

export default FilesPage;
