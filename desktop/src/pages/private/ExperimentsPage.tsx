import { Form, Formik, useField } from 'formik';
import { useCallback, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Link, useNavigate } from 'react-router-dom';
import * as Yup from 'yup';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { DataTable } from '../../components/ui/DataTable';
import { refetchDashboardDataQuery } from '../../graphql/queries/generated/dashboard';
import {
  refetchExperimentsQuery,
  useExperimentsQuery,
} from '../../graphql/queries/generated/experiments';
import type { ExperimentsQuery } from '../../graphql/queries/generated/experiments';
import { useCreateExperimentMutation } from '../../graphql/mutations/generated/createExperiment';
import { Modal } from '../../components/ui/Modal';

type ExperimentsPageProps = {
  onLogout: () => void;
};

type ExperimentFormValues = {
  name: string;
  description: string;
};

type ExperimentRow = ExperimentsQuery['experiments'][number];

const statusLabels: Record<string, string> = {
  running: 'Запущено',
  completed: 'Завершено',
  queued: 'Заплановано',
  failed: 'Помилка',
};

function formatTimeAgo(value: string | Date) {
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
  const navigate = useNavigate();
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

  const tableLabels = {
    page: 'Сторінка',
    of: 'з',
    rowsPerPage: 'Рядків на сторінці',
    previous: 'Назад',
    next: 'Далі',
  };
  const handleRowClick = useCallback(
    (row: ExperimentRow) => {
      navigate(`/app/experiments/${row._id}`);
    },
    [navigate]
  );

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

      <Modal open={isModalOpen} title="Створити експеримент" onClose={() => setModalOpen(false)}>
        <Formik<ExperimentFormValues>
          initialValues={{ name: '', description: '' }}
          validationSchema={experimentSchema}
          onSubmit={async (values, { resetForm, setStatus, setSubmitting }) => {
            setStatus(undefined);
            const trimmedName = values.name.trim();
            const trimmedDescription = values.description?.trim() ?? '';

            try {
              await createExperiment({
                variables: {
                  input: {
                    name: trimmedName,
                    description: trimmedDescription || null,
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
          {({ isSubmitting, status }) => (
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
