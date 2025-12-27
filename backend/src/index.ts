import 'dotenv/config';
import 'reflect-metadata';
import { ApolloServer } from 'apollo-server-express';
import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import { buildSchemaSync } from 'type-graphql';

import { User } from './core/user';
import { Auth } from './modules/auth/graphql/Auth';
import { Health } from './graphql/Health';
import { ServerInfoApi } from './graphql/ServerInfo';
import { Experiments } from './modules/experiments/graphql/Experiments';
import { Technologies } from './modules/technologies/graphql/Technologies';
import { Storage } from './modules/storage/graphql/Storage';
import { Files } from './modules/files/graphql/Files';
import { Computations } from './modules/computations/graphql/Computations';
import { CloudComputationWorker } from './modules/computations/services/CloudComputationWorker';
import { config } from './config/config';
import { GraphQLContext } from './types/context';
import { runSeeders } from './seeders';

async function bootstrap() {
  let cloudWorker: CloudComputationWorker | null = null;
  const schema = buildSchemaSync({
    resolvers: [
      Health,
      Auth,
      ServerInfoApi,
      Experiments,
      Technologies,
      Storage,
      Files,
      Computations,
    ],
    orphanedTypes: [User],
    validate: { forbidUnknownValues: false },
    ...(config.schemaFile ? { emitSchemaFile: config.schemaFile } : {}),
  });

  const apollo = new ApolloServer({
    schema,
    context: ({ req, res }): GraphQLContext => ({ req, res }) as GraphQLContext,
  });
  await apollo.start();

  const app = express();
  app.use(cors());
  app.use(express.json());
  apollo.applyMiddleware({ app: app as any, path: '/graphql' });

  if (config.mongoUri) {
    await mongoose.connect(config.mongoUri);
    console.log('Connected to MongoDB');
    await runSeeders();
    cloudWorker = new CloudComputationWorker();
    cloudWorker.start();
  } else {
    console.warn('MONGODB_URI is not set; skipping database connection');
  }

  app.listen(config.port, () => {
    console.log(`🚀 GraphQL ready at http://localhost:${config.port}${apollo.graphqlPath}`);
  });

  const shutdown = () => {
    cloudWorker?.stop();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((error) => {
  console.error('Failed to start backend', error);
  process.exit(1);
});
