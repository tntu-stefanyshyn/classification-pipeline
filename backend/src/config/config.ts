const nodeEnv = process.env.NODE_ENV ?? 'development';

export const config = {
  nodeEnv,
  isDev: nodeEnv === 'development',
  port: 4000,
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  schemaFile: nodeEnv === 'development' ? 'schema.gql' : undefined,
  s3: {
    bucket: process.env.AWS_S3_BUCKET ?? '',
    region: process.env.AWS_REGION ?? '',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
    presignExpiresSeconds: Number(process.env.AWS_S3_PRESIGN_EXPIRES ?? 900),
  },
};

export type BackendConfig = typeof config;
