import { useCallback, useMemo, useRef, useState, type FC } from 'react';
import type { ChangeEvent } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { AuthLayout } from '../../layout/AuthLayout';
import { FileInput } from '../../inputs/FileInput';
import { DataTable, tableLabels } from '../../ui/DataTable';
import { isCsvFile } from '../../../utils/fileValidation';
import { statusLabels } from './constants/statusLabels';
import {
  useCreateUploadedFileMutation,
  useDeleteUploadedFileMutation,
  useSignedUploadUrlLazyQuery,
  useUploadedFilesQuery,
} from './graphql';
import type { FileRow, FilesPageProps } from './FilesPage.types';
import { formatTimeAgo } from './utils/formatTimeAgo';

const FilesPage: FC<FilesPageProps> = ({ onLogout }) => {
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
  const emptyMessage = loading ? 'Завантаження файлів...' : 'Файлів ще немає — додайте перші дані.';

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

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
      await createFile({
        variables: {
          input: {
            filename: file.name,
            storageKey,
            sizeMb,
            status: 'uploaded',
          },
        },
      });

      await refetch();
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

  const handleDelete = useCallback(
    async (_id: string) => {
      if (!window.confirm('Видалити файл?')) return;
      try {
        await deleteFile({ variables: { _id } });
        await refetch();
      } catch (deleteErr) {
        setUploadError(
          deleteErr instanceof Error ? deleteErr.message : 'Не вдалося видалити файл.'
        );
      }
    },
    [deleteFile, refetch]
  );

  const columns = useMemo<ColumnDef<FileRow>[]>(
    () => [
      {
        header: 'Файл',
        accessorKey: 'filename',
        cell: (info) => <span className="item-title">{info.getValue<string>()}</span>,
      },
      {
        header: 'Розмір',
        accessorKey: 'sizeMb',
        cell: (info) => <span className="cell-number">{info.getValue<number>()} МБ</span>,
      },
      {
        header: 'Завантажено',
        accessorKey: 'uploadedAt',
        cell: (info) => {
          const value = info.getValue<string | Date>();
          return <span className="muted">{formatTimeAgo(value)}</span>;
        },
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
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="table-actions">
            <button
              className="btn ghost small icon"
              type="button"
              onClick={() => handleDelete(row.original._id)}
              disabled={deleting}
              aria-label="Видалити"
              title="Видалити"
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
    [deleting, handleDelete]
  );

  return (
    <AuthLayout
      badge="Авторизований доступ"
      title="Файли"
      subtitle="Керуйте завантаженими файлами та переглядайте статистику."
      onLogout={onLogout}
      actions={
        <div className="actions">
          <button
            className="btn primary"
            type="button"
            onClick={handleUploadClick}
            disabled={uploading}
          >
            {uploading ? 'Завантаження...' : 'Завантажити файл'}
          </button>
          <button className="btn ghost" type="button" onClick={() => refetch()} disabled={loading}>
            Оновити
          </button>
        </div>
      }
    >
      <FileInput ref={fileInputRef} accept=".csv,text/csv" onChange={handleFileChange} />

      <div className="stat-grid">
        <article className="card stat-card">
          <p className="muted">Усього файлів</p>
          <div className="stat-value">{files.length}</div>
          <p className="stat-hint">В системі</p>
        </article>
        <article className="card stat-card">
          <p className="muted">Загальний обсяг</p>
          <div className="stat-value">{totalSize} МБ</div>
          <p className="stat-hint">Сумарний розмір</p>
        </article>
      </div>

      <section className="card data-card">
        <header className="card-head">
          <div>
            <h3>Завантажені файли</h3>
            <p className="muted">Історія завантажень та статус обробки.</p>
          </div>
        </header>
        <div className="table-status">
          {error && <p className="error">Помилка: {error.message}</p>}
          {uploadError && <p className="error">{uploadError}</p>}
        </div>
        <DataTable
          data={files}
          columns={columns}
          emptyMessage={emptyMessage}
          labels={tableLabels}
          pageSize={5}
          pageSizeOptions={[5, 10, 20]}
          getRowId={(row) => row._id}
        />
      </section>
    </AuthLayout>
  );
};

export default FilesPage;
