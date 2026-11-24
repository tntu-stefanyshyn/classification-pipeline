// Message of the error `optimize` throws while a run is unfinished; the automatic re-optimization waits on it.
export const UNCOMPUTED_PIPELINES = 'There are uncomuted pipelines.';

// MongoDB error code of a unique index violation.
export const DUPLICATE_KEY_ERROR = 11000;

// How long a re-run waits for the workflow of a run another request is still creating (x100 ms).
export const ORPHAN_WAIT_ATTEMPTS = 20;

export const OPTIMIZATION_RUNNING = 'Оптимізація вже виконується.';
export const RERUN_DURING_OPTIMIZATION = 'Перезапуск недоступний під час оптимізації.';
