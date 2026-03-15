import { useEffect, useMemo, useState, type FC } from 'react';
import { Modal } from '../../ui/Modal';
import { Alert } from '../../ui/Alert';
import { CheckboxField } from '../../inputs/CheckboxField';
import { MetricWeightsSlider } from '../../inputs/MetricWeightsSlider';
import { metricKeys, metricLabels, queueLabels, queueOptions } from './constants/labels';
import { buildSettingsDraft, normalizeMetricInput, validateGraphSettings } from './utils/settings';
import type {
  GraphSettingsDraft,
  GraphSettingsModalProps,
  MetricKey,
} from './GraphSettingsModal.types';
import { InputControl } from '../../inputs/InputControl';

const GraphSettingsModal: FC<GraphSettingsModalProps> = ({
  open,
  settings,
  onClose,
  onSave,
  isBusy = false,
  isLocked = false,
  errorMessage,
  title = 'Налаштування графової структури',
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
  const sumValue = Number.isFinite(settingsValidation.sum) ? settingsValidation.sum : null;
  const sumDisplay = sumValue !== null ? `${sumValue.toFixed(2)}%` : '—';
  const sumClassName =
    sumValue === null
      ? 'graph-settings-sum'
      : `graph-settings-sum ${Math.abs(sumValue - 100) <= 0.01 ? 'ok' : 'warn'}`;
  const showErrors = settingsValidation.errors.length > 0 || Boolean(errorMessage);

  const updateSettingsMetrics = (nextMetrics: Record<MetricKey, string>) => {
    setSettingsDraft((prev) => {
      if (!prev) return prev;
      const updatedMetrics = { ...prev.metrics };
      metricKeys.forEach((key) => {
        if (key in nextMetrics) {
          updatedMetrics[key] = normalizeMetricInput(nextMetrics[key], prev.metrics[key]);
        }
      });
      return {
        ...prev,
        metrics: updatedMetrics,
      };
    });
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
          <div className="graph-settings-section">
            <div className="form-divider">Метрики</div>
            <Alert variant="info">Ваги метрик визначають їхню важливість для експерименту</Alert>
            <MetricWeightsSlider
              metrics={settingsDraft.metrics}
              labels={metricLabels}
              metricKeys={metricKeys}
              onChange={updateSettingsMetrics}
              disabled={inputsDisabled}
            />
            <div className="graph-settings-meta">
              <p className="muted small">NTPS — нормалізований час обробки зразка.</p>
              <div className={sumClassName}>
                <span className="graph-settings-sum-label">Сума ваг</span>
                <span className="graph-settings-sum-value">{sumDisplay}</span>
              </div>
            </div>
          </div>

          <div className="graph-settings-section">
            <div className="form-divider">Обчислення</div>
            <div className="graph-settings-queues">
              <InputControl
                type="number"
                label="Кількість кроків перехресної валідації"
                min={1}
                max={20}
                step={1}
                onChange={(e) => {
                  const nextValue = Number.parseInt(e.target.value, 10);
                  setSettingsDraft(
                    (prev) => prev && { ...prev, folds: Number.isFinite(nextValue) ? nextValue : 0 }
                  );
                }}
                value={settingsDraft.folds.toString()}
              />
              <InputControl
                type="number"
                label="Час гіпероптимізації для одного конвеєра (хв)"
                min={1}
                step={1}
                onChange={(e) => {
                  const nextValue = Number.parseInt(e.target.value, 10);
                  setSettingsDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          hyperOptimizationMinutesPerPipeline: Number.isFinite(nextValue)
                            ? nextValue
                            : 0,
                        }
                      : prev
                  );
                }}
                value={settingsDraft.hyperOptimizationMinutesPerPipeline.toString()}
              />
              <InputControl
                type="number"
                label="Відсоток даних для предікту (%)"
                min={1}
                max={99}
                step={1}
                onChange={(e) => {
                  const nextValue = Number.parseInt(e.target.value, 10);
                  setSettingsDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          predictDataPercent: Number.isFinite(nextValue) ? nextValue : 0,
                        }
                      : prev
                  );
                }}
                value={settingsDraft.predictDataPercent.toString()}
              />
            </div>

            <p className="graph-settings-label muted small">Режими виконання</p>
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
          </div>
          {showErrors ? (
            <div className="graph-settings-errors">
              {settingsValidation.errors.map((error) => (
                <p className="error small" key={error}>
                  {error}
                </p>
              ))}
              {errorMessage && <p className="error small">Помилка налаштувань: {errorMessage}</p>}
            </div>
          ) : null}
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
