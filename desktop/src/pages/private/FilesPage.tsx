import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { useUploadedFilesQuery } from '../../graphql/queries/generated/uploadedFiles';
import { useSignedUploadUrlLazyQuery } from '../../graphql/queries/generated/signedUpload';
import { useCreateUploadedFileMutation } from '../../graphql/mutations/generated/createUploadedFile';
import { useDeleteUploadedFileMutation } from '../../graphql/mutations/generated/deleteUploadedFile';

type FilesPageProps = {
  onLogout: () => void;
};

function formatTimeAgo(value: string) {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const hours = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60)));
  if (Number.isNaN(hours)) return '';
  if (hours < 24) return `${hours} год тому`;
  const days = Math.floor(hours / 24);
  return `${days} дн тому`;
}

export function FilesPage({ onLogout }: FilesPageProps) {
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

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;

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
      if (!signedUrl) {
        throw new Error('Не вдалося отримати URL для завантаження.');
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
            sizeMb,
            status: 'uploaded',
          },
        },
      });

      await refetch();
    } catch (uploadErr) {
      console.log('йобаний хуй');
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

  const handleDelete = async (id: string) => {
    if (!window.confirm('Видалити файл?')) return;
    try {
      await deleteFile({ variables: { id } });
      await refetch();
    } catch (deleteErr) {
      setUploadError(deleteErr instanceof Error ? deleteErr.message : 'Не вдалося видалити файл.');
    }
  };

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
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

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
        <div className="item-list">
          {loading && !files.length && <p className="muted">Завантаження файлів...</p>}
          {error && <p className="error">Помилка: {error.message}</p>}
          {uploadError && <p className="error">{uploadError}</p>}
          {!loading && !error && files.length === 0 && (
            <p className="muted">Файлів ще немає — додайте перші дані.</p>
          )}

          {files.map((file) => (
            <div key={file.id} className="item-row">
              <div className="item-meta">
                <p className="item-title">{file.filename}</p>
                <p className="muted">
                  {file.sizeMb} МБ • {formatTimeAgo(String(file.uploadedAt))}
                </p>
              </div>
              <div className="file-actions">
                <span className={`status-pill status-${file.status}`}>
                  {file.status === 'processed' ? 'Оброблено' : null}
                  {file.status === 'queued' ? 'В черзі' : null}
                  {file.status === 'ready' ? 'Готово' : null}
                  {file.status === 'uploaded' ? 'Завантажено' : null}
                  {file.status !== 'processed' &&
                  file.status !== 'queued' &&
                  file.status !== 'ready' &&
                  file.status !== 'uploaded'
                    ? file.status
                    : null}
                </span>
                <button
                  className="btn ghost small"
                  type="button"
                  onClick={() => handleDelete(file.id)}
                  disabled={deleting}
                >
                  Видалити
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </AuthLayout>
  );
}

export default FilesPage;
