const nodeEnv = process.env.NODE_ENV ?? 'development';

export const config = {
  nodeEnv,
  isDev: nodeEnv === 'development',
  port: 4000,
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  schemaFile:
     (nodeEnv === 'development' ? 'schema.gql' : undefined),
};

export type BackendConfig = typeof config;
