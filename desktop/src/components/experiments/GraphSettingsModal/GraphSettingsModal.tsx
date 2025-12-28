import { useEffect, useMemo, useState, type FC } from 'react';
import { Modal } from '../../ui/Modal';
import { Alert } from '../../ui/Alert';
import { CheckboxField } from '../../inputs/CheckboxField';
import { InputControl } from '../../inputs/InputControl';
import { metricKeys, metricLabels, queueLabels, queueOptions } from './constants/labels';
import { buildSettingsDraft, normalizeMetricInput, validateGraphSettings } from './utils/settings';
import type {
  GraphSettingsDraft,
  GraphSettingsModalProps,
  MetricKey,
} from './GraphSettingsModal.types';

const GraphSettingsModal: FC<GraphSettingsModalProps> = ({
  open,
  settings,
  onClose,
  onSave,
  isBusy = false,
  isLocked = false,
  errorMessage,
  title = 'Налаштування графа',
}) => {
  const [settingsDraft, setSettingsDraft] = useState<GraphSettingsDraft | null>(null);

  useEffect(() => {
    if (!open) {
      setSettingsDraft(null);
      return;
    }
    if (settingsDraft) return;
    setSettingsDraft(buildSettingsDraft(settings));
  }, [open, settings, settingsDraft]);

  const settingsValidation = useMemo(() => validateGraphSettings(settingsDraft), [settingsDraft]);
  const inputsDisabled = isBusy || isLocked;

  const updateSettingsMetric = (key: MetricKey, value: string) => {
    setSettingsDraft((prev) =>
      prev
        ? {
            ...prev,
            metrics: {
              ...prev.metrics,
              [key]: normalizeMetricInput(value, prev.metrics[key]),
            },
          }
        : prev
    );
  };

  const toggleSettingsQueue = (queue: GraphSettingsDraft['queues'][number]) => {
    setSettingsDraft((prev) => {
      if (!prev) return prev;
      const nextQueues = new Set(prev.queues);
      if (nextQueues.has(queue)) {
        nextQueues.delete(queue);
      } else {
        nextQueues.add(queue);
      }
      return { ...prev, queues: Array.from(nextQueues) };
    });
  };

  const handleSave = () => {
    if (!settingsValidation.normalized || inputsDisabled) return;
    void onSave(settingsValidation.normalized);
  };

  return (
    <Modal open={open} title={title} onClose={onClose}>
      {settingsDraft ? (
        <div className="node-modal">
          <Alert variant="info">
            Ваги метрик визначають їхню важливість для експерименту. Вводьте значення у відсотках
            (0-100), сума має дорівнювати 100%.
          </Alert>
          <div className="form-divider">Метрики</div>
          <div className="graph-settings-grid">
            {metricKeys.map((key) => {
              const inputId = `metric-${key}`;
              return (
                <InputControl
                  key={key}
                  id={inputId}
                  label={metricLabels[key]}
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={settingsDraft.metrics[key]}
                  onChange={(event) => updateSettingsMetric(key, event.target.value)}
                  disabled={inputsDisabled}
                />
              );
            })}
          </div>
          <p className="muted small">NTPS — нормалізований час обробки зразка.</p>
          <p className="muted small">
            Сума ваг:{' '}
            {Number.isFinite(settingsValidation.sum)
              ? `${settingsValidation.sum.toFixed(2)}%`
              : '—'}
          </p>
          <div className="form-divider">Тип обчислень</div>
          <Alert variant="info">
            Можна обрати один або обидва типи обчислень. За замовчуванням обрана хмара.
          </Alert>
          <div className="graph-settings-queues">
            {queueOptions.map((queue) => {
              const inputId = `queue-${queue}`;
              return (
                <CheckboxField
                  key={queue}
                  id={inputId}
                  label={queueLabels[queue]}
                  checked={settingsDraft.queues.includes(queue)}
                  onChange={() => toggleSettingsQueue(queue)}
                  disabled={inputsDisabled}
                />
              );
            })}
          </div>
          {settingsValidation.errors.map((error) => (
            <p className="error small" key={error}>
              {error}
            </p>
          ))}
          {errorMessage && <p className="error small">Помилка налаштувань: {errorMessage}</p>}
          <div className="graph-panel-actions">
            <button className="btn ghost" type="button" onClick={onClose}>
              Скасувати
            </button>
            <button
              className="btn primary"
              type="button"
              onClick={handleSave}
              disabled={!settingsValidation.isValid || inputsDisabled}
            >
              {isBusy ? 'Збереження...' : 'Зберегти'}
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
};

export default GraphSettingsModal;
