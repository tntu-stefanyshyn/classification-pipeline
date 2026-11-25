// Message of the error `optimize` throws while a run is unfinished; the automatic re-optimization waits on it.
export const UNCOMPUTED_PIPELINES = 'There are uncomuted pipelines.';

// MongoDB error code of a unique index violation.
export const DUPLICATE_KEY_ERROR = 11000;

export const OPTIMIZATION_RUNNING = 'Оптимізація вже виконується.';
export const RERUN_DURING_OPTIMIZATION = 'Перезапуск недоступний під час оптимізації.';

export const OPTIMIZATION_BLOCKED_BY_RERUN =
  'Оптимізацію не можна запустити, поки перезапуск ставиться в чергу. Спробуйте ще раз.';
export const RERUN_IN_PROGRESS = 'Перезапуск уже виконується, спробуйте ще раз.';

// Experiment lock leases (see ExperimentLock). An optimization holds it for the runner's timeout
// plus a margin, or for the default when the timeout is not set; a re-run admission briefly.
export const DEFAULT_OPTIMIZATION_LEASE_SECONDS = 60 * 60;
export const OPTIMIZATION_LEASE_MARGIN_MS = 5 * 60 * 1000;
export const RERUN_LEASE_MS = 60 * 1000;
// How long a re-run waits for another re-run's admission to finish (x the poll interval, 100 ms).
export const RERUN_LOCK_WAIT_ATTEMPTS = 100;
