import { config } from '../../config/config';

/**
 * Condition that ties an execution's report to that execution. Reports go through updates that
 * match it, so a report from an older execution of the same pipeline changes nothing.
 * Without an executionId the report is rejected, unless the rollout setting
 * `COMPUTATIONS_ACCEPT_LEGACY_REPORTS` allows reports from clients that predate it.
 */
export const executionFilter = (executionId?: string | number | null) => {
  if (executionId === undefined || executionId === null || executionId === '') {
    if (config.computations.acceptLegacyExecutionReports) {
      console.warn('Прийнято звіт запуску без executionId (режим сумісності)');
      return {};
    }
    throw new Error('Звіт запуску має містити executionId');
  }
  const value = Number(executionId);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`Некоректний executionId: ${executionId}`);
  }
  return { executionId: value };
};
