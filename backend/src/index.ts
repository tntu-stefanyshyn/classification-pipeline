import 'dotenv/config';
import 'reflect-metadata';
import { ApolloServer } from 'apollo-server-express';
import mongoose from 'mongoose';

import { PipelineModel } from './core/pipeline/models/PipelineModel';
import { createWorkflowReadIndexes, WorkflowModel } from './core/workflow/model/WorkflowModel';
import { createHttpApp } from './app';
import { config } from './config/config';
import { ConfigError } from './config/classes/ConfigError';
import { assertValidConfig } from './config/validateConfig';
import { buildAppSchema } from './schema';
import { GraphQLContext } from './types/context';
import { runSeeders } from './seeders';
import { runMigrations } from './migrations';
import { CloudComputationWorker } from './modules/computations/services/CloudComputationWorker';
import { LocalBackendComputationWorker } from './modules/computations/services/LocalBackendComputationWorker';

async function bootstrap() {
  // Fail before anything starts: a bad value should stop the backend here, not break a request later.
  assertValidConfig();
  let cloudWorker: CloudComputationWorker | null = null;
  let localWorker: LocalBackendComputationWorker | null = null;
  let shuttingDown = false;
  const schema = buildAppSchema(config.schemaFile);

  const apollo = new ApolloServer({
    schema,
    context: ({ req, res }): GraphQLContext => ({ req, res }) as GraphQLContext,
  });
  await apollo.start();

  const app = createHttpApp(apollo);

  if (config.mongoUri) {
    await mongoose.connect(config.mongoUri);
    console.log('Connected to MongoDB');
    // The per-machine local-run limit depends on the workflows unique index, and the one-re-run-
    // per-run guarantee on the pipelines unique index, so wait for both. Read indexes build in the
    // background and never delay startup: queries just scan until they exist.
    await WorkflowModel.init();
    await PipelineModel.init();
    createWorkflowReadIndexes().catch((error) =>
      console.error('Failed to create the workflow read indexes', error)
    );
    await runMigrations();
    await runSeeders();
    if (config.computations.cloudWorkerEnabled) {
      cloudWorker = new CloudComputationWorker();
      cloudWorker.start();
    }
    if (config.computations.localWorkerEnabled) {
      localWorker = new LocalBackendComputationWorker();
      localWorker.start();
    }
  } else {
    console.warn('MONGODB_URI is not set; skipping database connection');
  }

  const httpServer = app.listen(config.port, () => {
    console.log(`🚀 GraphQL ready at http://localhost:${config.port}${apollo.graphqlPath}`);
  });

  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}, shutting down...`);

    try {
      cloudWorker?.stop();
      localWorker?.stop();
      await apollo.stop();
      await mongoose.disconnect();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    } catch (error) {
      console.error('Failed to shutdown gracefully', error);
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((error) => {
  if (error instanceof ConfigError) {
    console.error(error.message);
  } else {
    console.error('Failed to start backend', error);
  }
  process.exit(1);
});
