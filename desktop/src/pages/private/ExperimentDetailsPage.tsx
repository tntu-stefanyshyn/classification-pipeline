import { Link, useParams } from 'react-router-dom';
import { Form, Formik } from 'formik';
import * as Yup from 'yup';
import { useMemo, useState } from 'react';
import { AuthLayout } from '../../components/layout/AuthLayout';
import {
  useExperimentQuery,
  refetchExperimentQuery,
} from '../../graphql/queries/generated/experiment';
import { useUpdateExperimentMutation } from '../../graphql/mutations/generated/updateExperiment';
import type { GraphNode } from '../../graphql/types.generated';
import { Modal } from '../../components/ui/Modal';

type ExperimentDetailsPageProps = {
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

export function ExperimentDetailsPage({ onLogout }: ExperimentDetailsPageProps) {
  const params = useParams();
  const id = params.id ?? '';
  const { data, loading, error, refetch } = useExperimentQuery({
    variables: { _id: id },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  });
  const [updateExperiment, { loading: updating, error: updateError }] =
    useUpdateExperimentMutation();
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const validationSchema = Yup.object({
    name: Yup.string().trim().min(3, 'Мінімум 3 символи').required('Вкажіть назву'),
    description: Yup.string().trim().max(400, 'Максимум 400 символів').optional(),
  });

  const experiment = data?.experiment;
  const graph = experiment?.graph;
  const pathsCount = useMemo(() => countGraphPaths(graph?.nodes ?? []), [graph]);

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
          <Link className="btn ghost" to="/app">
            На дашборд
          </Link>
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
            <article className="card stat-card">
              <p className="muted">ID</p>
              <div className="stat-value small">{experiment._id}</div>
              <p className="muted small">Ідентифікатор експерименту</p>
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

      <Modal
        open={isEditModalOpen}
        title="Редагувати експеримент"
        onClose={() => setEditModalOpen(false)}
      >
        <Formik
          enableReinitialize
          initialValues={{
            name: experiment?.name ?? '',
            description: experiment?.description ?? '',
          }}
          validationSchema={validationSchema}
          onSubmit={async (values, { setSubmitting, setStatus }) => {
            setStatus(undefined);
            if (!experiment) return;
            try {
              await updateExperiment({
                variables: {
                  input: {
                    _id: experiment._id,
                    name: values.name.trim(),
                    description: values.description.trim() || null,
                  },
                },
                refetchQueries: [refetchExperimentQuery({ _id: experiment._id })],
                awaitRefetchQueries: true,
              });
              setEditModalOpen(false);
            } catch (_err) {
              setStatus('Не вдалося оновити експеримент.');
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {({ values, handleChange, handleBlur, errors, touched, isSubmitting, status }) => (
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
              {status && <p className="error">{status}</p>}
              {updateError && <p className="error">Помилка: {updateError.message}</p>}
              <div className="actions">
                <button className="btn ghost" type="button" onClick={() => setEditModalOpen(false)}>
                  Скасувати
                </button>
                <button className="btn primary" type="submit" disabled={isSubmitting || updating}>
                  {isSubmitting || updating ? 'Збереження...' : 'Зберегти зміни'}
                </button>
              </div>
            </Form>
          )}
        </Formik>
      </Modal>
    </AuthLayout>
  );
}

const countGraphPaths = (nodes: GraphNode[]): number => {
  if (nodes.length === 0) return 0;
  const ids = new Set(nodes.map((node) => node._id));
  const childrenByParent = new Map<string, string[]>();

  nodes.forEach((node) => {
    if (!node.parentId || !ids.has(node.parentId)) return;
    const list = childrenByParent.get(node.parentId) ?? [];
    list.push(node._id);
    childrenByParent.set(node.parentId, list);
  });

  const roots = nodes.filter((node) => !node.parentId || !ids.has(node.parentId));
  if (roots.length === 0) return 0;

  const memo = new Map<string, number>();
  const visiting = new Set<string>();

  const dfs = (id: string): number => {
    if (visiting.has(id)) return 0;
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    visiting.add(id);
    const children = childrenByParent.get(id) ?? [];
    let paths = 0;
    if (children.length === 0) {
      paths = 1;
    } else {
      children.forEach((childId) => {
        paths += dfs(childId);
      });
    }
    visiting.delete(id);
    memo.set(id, paths);
    return paths;
  };

  let pathsCount = 0;
  roots.forEach((root) => {
    pathsCount += dfs(root._id);
  });

  return pathsCount;
};

export default ExperimentDetailsPage;
