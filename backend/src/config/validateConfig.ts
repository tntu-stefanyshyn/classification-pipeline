import mongoose from 'mongoose';

import { durationToSeconds } from '../modules/auth/constants/token';
import { ConfigError } from './classes/ConfigError';
import {
  BOOLEAN_VALUES,
  BOOLEAN_VARIABLES,
  DEFAULT_JWT_SECRETS,
  DURATION_VARIABLES,
  MAX_PRESIGN_SECONDS,
  MAX_TIMER_MS,
  PLACEHOLDER_SERVICE_TOKENS,
  POLL_INTERVAL_VARIABLES,
} from './constants/validation';

export type ConfigIssues = {
  /** Problems that stop the backend from starting. */
  errors: string[];
  /** Settings that work but are probably not what the operator wants. */
  warnings: string[];
};

type Env = NodeJS.ProcessEnv;

const isSet = (value: string | undefined): value is string => value !== undefined;
const isBlank = (value: string) => value.trim() === '';

// A very long digit string parses to Infinity, which the range check rejects.
const isIntegerInRange = (value: string, max: number) =>
  /^\d+$/.test(value.trim()) && Number(value) >= 1 && Number(value) <= max;

const isHttpUrl = (value: string) => {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

// The driver parses the string in its constructor without connecting, so a malformed value or one
// without a host (`mongodb:///app`) is caught here instead of in `mongoose.connect`.
const isMongoUri = (value: string) => {
  try {
    return Boolean(new mongoose.mongo.MongoClient(value.trim()));
  } catch {
    return false;
  }
};

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
      'MONGODB_URI must be a valid MongoDB connection string with at least one host, for example mongodb://localhost:27017/app, mongodb://host1,host2/app?replicaSet=rs0 or mongodb+srv://cluster.example.net/app.'
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

  POLL_INTERVAL_VARIABLES.forEach((name) => {
    const value = env[name];
    if (isSet(value) && !isIntegerInRange(value, MAX_TIMER_MS)) {
      errors.push(
        `${name} must be a whole number of milliseconds from 1 to ${MAX_TIMER_MS} (got "${value}").`
      );
    }
  });

  const presign = env.AWS_S3_PRESIGN_EXPIRES;
  if (isSet(presign)) {
    if (!isIntegerInRange(presign, MAX_PRESIGN_SECONDS)) {
      errors.push(
        `AWS_S3_PRESIGN_EXPIRES must be a whole number of seconds from 1 to ${MAX_PRESIGN_SECONDS} (got "${presign}").`
      );
    }
  }

  DURATION_VARIABLES.forEach((name) => {
    const value = env[name];
    if (!isSet(value)) return;
    let seconds: number;
    try {
      seconds = durationToSeconds(value);
    } catch {
      errors.push(
        `${name} must be a number of seconds or a number with s, m, h or d, for example 15m (got "${value}").`
      );
      return;
    }
    // The expiry is `new Date(now + seconds * 1000)`; past the last date JavaScript supports it is
    // an Invalid Date and saving a session would fail at login instead of at startup.
    if (Number.isNaN(new Date(Date.now() + seconds * 1000).getTime())) {
      errors.push(
        `${name} is too long: its expiry would be beyond the last date JavaScript supports (got "${value}").`
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
