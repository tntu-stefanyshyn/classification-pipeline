import { durationToSeconds } from '../modules/auth/constants/token';

export type ConfigIssues = {
  /** Problems that stop the backend from starting. */
  errors: string[];
  /** Settings that work but are probably not what the operator wants. */
  warnings: string[];
};

type Env = NodeJS.ProcessEnv;

/** Secrets that ship in the code or in `.env.example`; a production backend must not use them. */
const DEFAULT_JWT_SECRETS = ['dev-secret', 'change-me'];
const PLACEHOLDER_SERVICE_TOKENS = ['change-me', 'change-me-service-token'];

const BOOLEAN_VARIABLES = [
  'BACKEND_CLOUD_WORKER_ENABLED',
  'BACKEND_LOCAL_WORKER_ENABLED',
  'BACKEND_HYPER_OPTIMIZATION_ENABLED',
];
const BOOLEAN_VALUES = ['1', 'true', 'yes', '0', 'false', 'no'];

/** Poll intervals in milliseconds. */
const POSITIVE_INTEGER_VARIABLES = ['LOCAL_WORKER_POLL_MS', 'CLOUD_WORKER_POLL_MS'];

/** Amazon S3 does not accept presigned URLs that stay valid for more than seven days. */
const MAX_PRESIGN_SECONDS = 7 * 24 * 60 * 60;

const DURATION_VARIABLES = ['ACCESS_TOKEN_TTL', 'REFRESH_TOKEN_TTL'];

/** Thrown at startup with every problem found, one per line. */
export class ConfigError extends Error {
  constructor(public readonly errors: string[]) {
    super(
      `Invalid backend configuration (${errors.length} ${errors.length === 1 ? 'problem' : 'problems'}):\n` +
        errors.map((error) => `  - ${error}`).join('\n') +
        '\nFix the values in backend/.env or the environment; see docs/operations/configuration.md.'
    );
    this.name = 'ConfigError';
  }
}

const isSet = (value: string | undefined): value is string => value !== undefined;
const isBlank = (value: string) => value.trim() === '';

const isPositiveInteger = (value: string) => /^\d+$/.test(value.trim()) && Number(value) >= 1;

const isHttpUrl = (value: string) => {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

const isMongoUri = (value: string) => /^mongodb(\+srv)?:\/\/\S+$/.test(value.trim());

/**
 * Checks the environment the backend reads in `config.ts`. It does not read `config` itself, so it
 * runs on any environment object; call `assertValidConfig` at startup.
 */
export const validateConfig = (env: Env = process.env): ConfigIssues => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const production = env.NODE_ENV === 'production';

  const mongoUri = env.MONGODB_URI;
  if (!isSet(mongoUri) || isBlank(mongoUri)) {
    errors.push(
      'MONGODB_URI is required, for example mongodb://localhost:27017/app. Without it the backend would start without a database.'
    );
  } else if (!isMongoUri(mongoUri)) {
    errors.push(
      'MONGODB_URI must be a MongoDB connection string starting with mongodb:// or mongodb+srv://.'
    );
  }

  const jwtSecret = env.JWT_SECRET?.trim() ?? '';
  if (production) {
    if (!jwtSecret) {
      errors.push('JWT_SECRET is required when NODE_ENV=production; set a long random string.');
    } else if (DEFAULT_JWT_SECRETS.includes(jwtSecret)) {
      errors.push(
        `JWT_SECRET is "${jwtSecret}", a default value that is publicly known; set a long random string when NODE_ENV=production.`
      );
    }
  } else if (!jwtSecret || DEFAULT_JWT_SECRETS.includes(jwtSecret)) {
    warnings.push(
      'JWT_SECRET is not set or has a default value; tokens are signed with a publicly known secret. Acceptable for development only.'
    );
  }

  const serviceToken = env.BACKEND_SERVICE_TOKEN?.trim() ?? '';
  if (!serviceToken) {
    warnings.push(
      'BACKEND_SERVICE_TOKEN is not set; worker operations stay closed, so no worker or compute container can claim runs or report results.'
    );
  } else if (PLACEHOLDER_SERVICE_TOKENS.includes(serviceToken)) {
    const message = `BACKEND_SERVICE_TOKEN is "${serviceToken}", a placeholder from .env.example; whoever knows it can read and change every experiment.`;
    if (production) errors.push(`${message} Set a long random string when NODE_ENV=production.`);
    else warnings.push(message);
  }

  BOOLEAN_VARIABLES.forEach((name) => {
    const value = env[name];
    if (isSet(value) && !BOOLEAN_VALUES.includes(value.trim().toLowerCase())) {
      errors.push(`${name} must be one of ${BOOLEAN_VALUES.join(', ')} (got "${value}").`);
    }
  });

  POSITIVE_INTEGER_VARIABLES.forEach((name) => {
    const value = env[name];
    if (isSet(value) && !isPositiveInteger(value)) {
      errors.push(
        `${name} must be a whole number of milliseconds greater than 0 (got "${value}").`
      );
    }
  });

  const presign = env.AWS_S3_PRESIGN_EXPIRES;
  if (isSet(presign)) {
    if (!isPositiveInteger(presign) || Number(presign) > MAX_PRESIGN_SECONDS) {
      errors.push(
        `AWS_S3_PRESIGN_EXPIRES must be a whole number of seconds from 1 to ${MAX_PRESIGN_SECONDS} (got "${presign}").`
      );
    }
  }

  DURATION_VARIABLES.forEach((name) => {
    const value = env[name];
    if (!isSet(value)) return;
    try {
      durationToSeconds(value);
    } catch {
      errors.push(
        `${name} must be a number of seconds or a number with s, m, h or d, for example 15m (got "${value}").`
      );
    }
  });

  const graphqlUrl = env.BACKEND_GRAPHQL_URL;
  if (isSet(graphqlUrl) && !isHttpUrl(graphqlUrl)) {
    errors.push(`BACKEND_GRAPHQL_URL must be an http:// or https:// URL (got "${graphqlUrl}").`);
  }

  if (!env.AWS_S3_BUCKET?.trim() || !env.AWS_REGION?.trim()) {
    warnings.push(
      'AWS_S3_BUCKET or AWS_REGION is not set; uploading and downloading dataset files will fail.'
    );
  }

  return { errors, warnings };
};

/** Logs the warnings and throws a `ConfigError` listing every error. */
export const assertValidConfig = (
  env: Env = process.env,
  log: Pick<Console, 'warn'> = console
): void => {
  const { errors, warnings } = validateConfig(env);
  warnings.forEach((warning) => log.warn(`[config] ${warning}`));
  if (errors.length > 0) throw new ConfigError(errors);
};
