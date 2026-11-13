import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ConfigError, assertValidConfig, validateConfig } from './validateConfig';

const validEnv = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  MONGODB_URI: 'mongodb://localhost:27017/app',
  JWT_SECRET: 'a-long-random-secret-for-tests',
  BACKEND_SERVICE_TOKEN: 'a-long-random-service-token',
  AWS_S3_BUCKET: 'bucket',
  AWS_REGION: 'eu-central-1',
  ...overrides,
});

const errorsOf = (overrides: NodeJS.ProcessEnv) => validateConfig(validEnv(overrides)).errors;

test('a complete configuration has no errors and no warnings', () => {
  assert.deepEqual(validateConfig(validEnv()), { errors: [], warnings: [] });
});

test('MONGODB_URI is required and must be a MongoDB connection string', () => {
  assert.match(errorsOf({ MONGODB_URI: undefined })[0], /MONGODB_URI is required/);
  assert.match(errorsOf({ MONGODB_URI: '   ' })[0], /MONGODB_URI is required/);
  assert.match(errorsOf({ MONGODB_URI: 'http://localhost:27017' })[0], /mongodb:\/\//);
  assert.deepEqual(
    errorsOf({ MONGODB_URI: 'mongodb+srv://user:pass@cluster.example.net/app' }),
    []
  );
});

test('production refuses a missing or default JWT_SECRET', () => {
  assert.match(
    errorsOf({ NODE_ENV: 'production', JWT_SECRET: undefined })[0],
    /JWT_SECRET is required/
  );
  assert.match(errorsOf({ NODE_ENV: 'production', JWT_SECRET: 'dev-secret' })[0], /default value/);
  assert.match(errorsOf({ NODE_ENV: 'production', JWT_SECRET: 'change-me' })[0], /default value/);
  assert.deepEqual(errorsOf({ NODE_ENV: 'production' }), []);
});

test('development only warns about a default JWT_SECRET', () => {
  const issues = validateConfig(validEnv({ JWT_SECRET: undefined }));
  assert.deepEqual(issues.errors, []);
  assert.equal(issues.warnings.length, 1);
  assert.match(issues.warnings[0], /JWT_SECRET/);
});

test('the service token placeholder is an error in production and a warning elsewhere', () => {
  const placeholder = { BACKEND_SERVICE_TOKEN: 'change-me-service-token' };
  assert.match(errorsOf({ ...placeholder, NODE_ENV: 'production' })[0], /BACKEND_SERVICE_TOKEN/);
  const issues = validateConfig(validEnv(placeholder));
  assert.deepEqual(issues.errors, []);
  assert.match(issues.warnings[0], /placeholder/);
});

test('a missing service token only warns, because worker operations then stay closed', () => {
  const issues = validateConfig(validEnv({ BACKEND_SERVICE_TOKEN: undefined }));
  assert.deepEqual(issues.errors, []);
  assert.match(issues.warnings[0], /worker operations stay closed/);
});

test('poll intervals must be whole numbers greater than zero', () => {
  ['0', '-5', '1.5', 'abc', ''].forEach((value) => {
    assert.match(errorsOf({ LOCAL_WORKER_POLL_MS: value })[0], /LOCAL_WORKER_POLL_MS/);
    assert.match(errorsOf({ CLOUD_WORKER_POLL_MS: value })[0], /CLOUD_WORKER_POLL_MS/);
  });
  assert.deepEqual(errorsOf({ LOCAL_WORKER_POLL_MS: '3000', CLOUD_WORKER_POLL_MS: '5000' }), []);
});

test('the presigned URL lifetime is limited to what S3 accepts', () => {
  assert.match(errorsOf({ AWS_S3_PRESIGN_EXPIRES: '0' })[0], /AWS_S3_PRESIGN_EXPIRES/);
  assert.match(errorsOf({ AWS_S3_PRESIGN_EXPIRES: '604801' })[0], /AWS_S3_PRESIGN_EXPIRES/);
  assert.deepEqual(errorsOf({ AWS_S3_PRESIGN_EXPIRES: '604800' }), []);
});

test('token lifetimes must be durations', () => {
  assert.match(errorsOf({ ACCESS_TOKEN_TTL: 'soon' })[0], /ACCESS_TOKEN_TTL/);
  assert.match(errorsOf({ REFRESH_TOKEN_TTL: '0d' })[0], /REFRESH_TOKEN_TTL/);
  assert.deepEqual(errorsOf({ ACCESS_TOKEN_TTL: '900', REFRESH_TOKEN_TTL: '30d' }), []);
});

test('boolean switches accept only the documented values', () => {
  assert.match(
    errorsOf({ BACKEND_CLOUD_WORKER_ENABLED: 'maybe' })[0],
    /BACKEND_CLOUD_WORKER_ENABLED/
  );
  ['1', 'true', 'YES', '0', 'false', 'no'].forEach((value) => {
    assert.deepEqual(errorsOf({ BACKEND_LOCAL_WORKER_ENABLED: value }), []);
  });
});

test('BACKEND_GRAPHQL_URL must be an http or https URL', () => {
  assert.match(
    errorsOf({ BACKEND_GRAPHQL_URL: 'host.docker.internal:4000' })[0],
    /BACKEND_GRAPHQL_URL/
  );
  assert.match(
    errorsOf({ BACKEND_GRAPHQL_URL: 'ftp://backend/graphql' })[0],
    /BACKEND_GRAPHQL_URL/
  );
  assert.deepEqual(
    errorsOf({ BACKEND_GRAPHQL_URL: 'http://host.docker.internal:4000/graphql' }),
    []
  );
});

test('a missing S3 bucket or region warns that uploads will fail', () => {
  const issues = validateConfig(validEnv({ AWS_S3_BUCKET: undefined }));
  assert.deepEqual(issues.errors, []);
  assert.match(issues.warnings[0], /uploading and downloading/);
});

test('assertValidConfig lists every error in one ConfigError and logs the warnings', () => {
  const logged: string[] = [];
  const env = validEnv({
    MONGODB_URI: undefined,
    LOCAL_WORKER_POLL_MS: 'fast',
    BACKEND_SERVICE_TOKEN: undefined,
  });

  assert.throws(
    () => assertValidConfig(env, { warn: (message: string) => logged.push(message) }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigError);
      assert.equal(error.errors.length, 2);
      assert.match(error.message, /2 problems/);
      assert.match(error.message, /MONGODB_URI is required/);
      assert.match(error.message, /LOCAL_WORKER_POLL_MS/);
      assert.match(error.message, /docs\/operations\/configuration\.md/);
      return true;
    }
  );
  assert.equal(logged.length, 1);
  assert.match(logged[0], /^\[config\] BACKEND_SERVICE_TOKEN is not set/);
});

test('assertValidConfig returns quietly for a valid configuration', () => {
  const logged: string[] = [];
  assertValidConfig(validEnv(), { warn: (message: string) => logged.push(message) });
  assert.deepEqual(logged, []);
});
