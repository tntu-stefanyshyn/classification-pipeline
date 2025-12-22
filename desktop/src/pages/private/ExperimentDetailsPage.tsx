import { useParams } from 'react-router-dom';
import { Form, Formik } from 'formik';
import * as Yup from 'yup';
import { useState } from 'react';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { useExperimentQuery } from '../../graphql/queries/generated/experiment';
import { useUpdateExperimentMutation } from '../../graphql/mutations/generated/updateExperiment';
import { refetchExperimentQuery } from '../../graphql/queries/generated/experiment';
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
    variables: { id },
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
                {experiment.status !== 'running' &&
                experiment.status !== 'completed' &&
                experiment.status !== 'queued'
                  ? experiment.status
                  : null}
              </span>
            </article>
            <article className="card stat-card">
              <p className="muted">Запуски</p>
              <div className="stat-value">{experiment.runs}</div>
              <p className="muted small">Оновлено {formatTimeAgo(String(experiment.createdAt))}</p>
            </article>
            <article className="card stat-card">
              <p className="muted">Файл</p>
              <div className="stat-value small">{experiment.fileName || 'Не додано'}</div>
              <p className="muted small">ID: {experiment.id}</p>
            </article>
          </div>

          <section className="card data-card">
            <header className="card-head">
              <div>
                <h3>Конфігурація графа</h3>
                <p className="muted">
                  Автоматично створений граф, повʼязаний один до одного з експериментом.
                </p>
              </div>
            </header>
            {!graph && <p className="muted">Граф ще не створений.</p>}
            {graph && (
              <div className="graph-block">
                <div className="graph-info">
                  <p className="muted small">Graph ID: {graph.id}</p>
                  <p className="muted small">
                    Вузли: {graph.nodes.length} • Ребра: {graph.edges.length}
                  </p>
                  <p className="muted small">Створено: {formatTimeAgo(String(graph.createdAt))}</p>
                </div>
                <div className="graph-grid">
                  <div>
                    <ul className="graph-tree">
                      {graph.nodes.map((node) => (
                        <NodeItem key={node.id} node={node as unknown as GraphNodeType} />
                      ))}
                    </ul>
                  </div>
                  <div>
                    <ul className="graph-list">
                      {graph.edges.map((edge) => (
                        <li key={edge.id} className="muted small">
                          {edge.from} → {edge.to}
                        </li>
                      ))}
                    </ul>
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
                    id: experiment.id,
                    name: values.name.trim(),
                    description: values.description.trim() || null,
                  },
                },
                refetchQueries: [refetchExperimentQuery({ id: experiment.id })],
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

type GraphNodeType = {
  id: string;
  label: string;
  type?: string | null;
  children?: GraphNodeType[] | null;
};

function NodeItem({ node }: { node: GraphNodeType }) {
  return (
    <li className="graph-node-item">
      <div>
        <strong>{node.label}</strong> <span className="muted small">({node.type || 'node'})</span>
      </div>
      {node.children && node.children.length > 0 ? (
        <ul className="graph-tree nested">
          {node.children.map((child) => (
            <NodeItem key={child.id} node={child} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export default ExperimentDetailsPage;
