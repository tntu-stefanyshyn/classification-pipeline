const nodeEnv = process.env.NODE_ENV ?? 'development';
const defaultGraphqlUrl =
  process.env.BACKEND_GRAPHQL_URL ?? 'http://host.docker.internal:4000/graphql';

export const config = {
  nodeEnv,
  isDev: nodeEnv === 'development',
  port: 4000,
  backend: {
    graphqlUrl: defaultGraphqlUrl,
    serviceToken: process.env.BACKEND_SERVICE_TOKEN ?? '',
  },
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
  aws: {
    region: process.env.AWS_REGION ?? '',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
    batchJobQueue: process.env.AWS_BATCH_JOB_QUEUE ?? '',
    batchJobDefinition: process.env.AWS_BATCH_JOB_DEFINITION ?? '',
    batchJobNamePrefix: process.env.AWS_BATCH_JOB_NAME_PREFIX ?? 'experiment-run',
    resultsBucket: process.env.AWS_COMPUTATION_RESULTS_BUCKET ?? process.env.AWS_S3_BUCKET ?? '',
    resultsPrefix: process.env.AWS_COMPUTATION_RESULTS_PREFIX ?? 'computations',
    resultsRegion: process.env.AWS_COMPUTATION_RESULTS_REGION ?? '',
  },
  computations: {
    localPollMs: Number(process.env.LOCAL_WORKER_POLL_MS ?? 3000),
    cloudPollMs: Number(process.env.CLOUD_WORKER_POLL_MS ?? 5000),
    pythonBin: process.env.PYTHON_BIN ?? 'python3',
    handlerModule: process.env.COMPUTE_HANDLER_MODULE ?? 'aws_jobs.compute_handler',
    optimizationModule: process.env.OPTIMIZATION_HANDLER_MODULE ?? 'aws_jobs.optimization_handler',
  },
};

export type BackendConfig = typeof config;
