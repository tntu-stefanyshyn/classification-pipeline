/**
 * Condition that ties an execution's report to that execution. Reports go through updates that
 * match it, so a report from an older execution of the same pipeline changes nothing.
 */
export const executionFilter = (executionId: string | number) => {
  const value = Number(executionId);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`Некоректний executionId: ${executionId}`);
  }
  return { executionId: value };
};
