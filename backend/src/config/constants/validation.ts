/** Secrets that ship in the code or in `.env.example`; a production backend must not use them. */
export const DEFAULT_JWT_SECRETS = ['dev-secret', 'change-me'];
export const PLACEHOLDER_SERVICE_TOKENS = ['change-me', 'change-me-service-token'];

export const BOOLEAN_VARIABLES = [
  'BACKEND_CLOUD_WORKER_ENABLED',
  'BACKEND_LOCAL_WORKER_ENABLED',
  'BACKEND_HYPER_OPTIMIZATION_ENABLED',
];
export const BOOLEAN_VALUES = ['1', 'true', 'yes', '0', 'false', 'no'];

/** Poll intervals in milliseconds. */
export const POLL_INTERVAL_VARIABLES = ['LOCAL_WORKER_POLL_MS', 'CLOUD_WORKER_POLL_MS'];

/** The longest delay a Node.js timer accepts (2^31 - 1 ms); a longer one fires after 1 ms. */
export const MAX_TIMER_MS = 2147483647;

/** Amazon S3 does not accept presigned URLs that stay valid for more than seven days. */
export const MAX_PRESIGN_SECONDS = 7 * 24 * 60 * 60;

export const DURATION_VARIABLES = ['ACCESS_TOKEN_TTL', 'REFRESH_TOKEN_TTL'];
