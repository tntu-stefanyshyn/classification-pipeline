import { Form, Formik, useField } from 'formik';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as Yup from 'yup';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { refetchDashboardDataQuery } from '../../graphql/queries/generated/dashboard';
import {
  refetchExperimentsQuery,
  useExperimentsQuery,
} from '../../graphql/queries/generated/experiments';
import { useCreateExperimentMutation } from '../../graphql/mutations/generated/createExperiment';
import { Modal } from '../../components/ui/Modal';

type ExperimentsPageProps = {
  onLogout: () => void;
};

type ExperimentFormValues = {
  name: string;
  description: string;
  file: File | null;
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

const experimentSchema = Yup.object({
  name: Yup.string().trim().min(3, 'Мінімум 3 символи').required('Вкажіть назву'),
  description: Yup.string().trim().max(400, 'Максимум 400 символів').optional(),
});

function TextAreaField({
  name,
  label,
  placeholder,
}: {
  name: string;
  label: string;
  placeholder?: string;
}) {
  const [field, meta] = useField(name);
  const hasError = Boolean(meta.touched && meta.error);

  return (
    <div className="form-group">
      <label htmlFor={name}>{label}</label>
      <textarea
        {...field}
        id={name}
        placeholder={placeholder}
        className={hasError ? 'input-error' : ''}
      />
      <p className="error error-space">{hasError ? meta.error : '\u00A0'}</p>
    </div>
  );
}

function TextInputField({
  name,
  label,
  placeholder,
  type = 'text',
}: {
  name: string;
  label: string;
  placeholder?: string;
  type?: string;
}) {
  const [field, meta] = useField(name);
  const hasError = Boolean(meta.touched && meta.error);

  return (
    <div className="form-group">
      <label htmlFor={name}>{label}</label>
      <input
        {...field}
        id={name}
        type={type}
        placeholder={placeholder}
        className={hasError ? 'input-error' : ''}
      />
      <p className="error error-space">{hasError ? meta.error : '\u00A0'}</p>
    </div>
  );
}

export function ExperimentsPage({ onLogout }: ExperimentsPageProps) {
  const { data, loading, error, refetch } = useExperimentsQuery({
    fetchPolicy: 'cache-and-network',
  });
  const [createExperiment, { loading: creating, error: creationError }] =
    useCreateExperimentMutation();
  const [isModalOpen, setModalOpen] = useState(false);

  // Keep dashboard stats fresh when a new experiment is created.
  const refetchQueries = useMemo(
    () => [refetchExperimentsQuery(), refetchDashboardDataQuery()],
    []
  );

  const experiments = data?.experiments ?? [];

  return (
    <AuthLayout
      badge="Авторизований доступ"
      title="Експерименти"
      subtitle="Переглядайте запуски та створюйте нові експерименти з файлом вхідних даних."
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
              <p className="muted">Статуси, файли та час створення.</p>
            </div>
          </header>
          <div className="item-list">
            {loading && !experiments.length && (
              <p className="muted">Завантаження експериментів...</p>
            )}
            {error && <p className="error">Помилка: {error.message}</p>}
            {!loading && !error && experiments.length === 0 && (
              <p className="muted">Експерименти ще не додані.</p>
            )}

            {experiments.map((experiment) => (
              <Link
                key={experiment.id}
                to={`/app/experiments/${experiment.id}`}
                className="item-row experiment-row experiment-link"
              >
                <div className="item-meta">
                  <p className="item-title">{experiment.name}</p>
                  <p className="muted small">{experiment.description || 'Опис не додано'}</p>
                  <p className="muted small">
                    Файл: <strong>{experiment.fileName || 'Не додано'}</strong> • Запуски:{' '}
                    {experiment.runs}
                  </p>
                </div>
                <div className="experiment-meta">
                  <span className={`status-pill status-${experiment.status}`}>
                    {experiment.status === 'running' ? 'Запущено' : null}
                    {experiment.status === 'completed' ? 'Завершено' : null}
                    {experiment.status === 'queued' ? 'Заплановано' : null}
                    {experiment.status !== 'running' &&
                    experiment.status !== 'completed' &&
                    experiment.status !== 'queued'
                      ? experiment.status
                      : null}
                  </span>
                  <span className="muted small">{formatTimeAgo(String(experiment.createdAt))}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <Modal open={isModalOpen} title="Створити експеримент" onClose={() => setModalOpen(false)}>
        <Formik<ExperimentFormValues>
          initialValues={{ name: '', description: '', file: null }}
          validationSchema={experimentSchema}
          onSubmit={async (values, { resetForm, setStatus, setSubmitting }) => {
            setStatus(undefined);
            const trimmedName = values.name.trim();
            const trimmedDescription = values.description?.trim() ?? '';
            const fileName = values.file?.name ?? null;

            try {
              await createExperiment({
                variables: {
                  input: {
                    name: trimmedName,
                    description: trimmedDescription || null,
                    fileName,
                  },
                },
                refetchQueries,
                awaitRefetchQueries: true,
              });
              resetForm();
              setModalOpen(false);
            } catch (_error) {
              setStatus('Не вдалося створити експеримент. Спробуйте ще раз.');
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {({ setFieldValue, values, isSubmitting, status }) => (
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
                <label htmlFor="file">Файл експерименту</label>
                <div className="file-input">
                  <input
                    id="file"
                    name="file"
                    type="file"
                    onChange={(event) => {
                      const selectedFile = event.currentTarget.files?.[0] ?? null;
                      setFieldValue('file', selectedFile);
                    }}
                    accept=".csv,.json,.zip,.txt"
                  />
                  <p className="muted small">
                    {values.file
                      ? `Обрано: ${values.file.name}`
                      : 'Додайте файл з даними або конфігурацією.'}
                  </p>
                </div>
              </div>

              {status && <p className="error">{status}</p>}
              {creationError && <p className="error">Помилка: {creationError.message}</p>}

              <div className="actions">
                <button className="btn ghost" type="button" onClick={() => setModalOpen(false)}>
                  Скасувати
                </button>
                <button className="btn primary" type="submit" disabled={creating || isSubmitting}>
                  {creating || isSubmitting ? 'Створення...' : 'Створити експеримент'}
                </button>
              </div>
            </Form>
          )}
        </Formik>
      </Modal>
    </AuthLayout>
  );
}

export default ExperimentsPage;
