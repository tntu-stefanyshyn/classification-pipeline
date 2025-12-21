import 'dotenv/config';
import 'reflect-metadata';
import { ApolloServer } from 'apollo-server-express';
import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import { buildSchema } from 'type-graphql';

import { User } from './entities/User';
import { AuthResolver } from './resolvers/auth';
import { HealthResolver } from './resolvers/health';
import { ServerInfoResolver } from './resolvers/serverInfo';
import { config } from './config/config';

async function bootstrap() {
  const schema = await buildSchema({
    resolvers: [HealthResolver, AuthResolver, ServerInfoResolver],
    orphanedTypes: [User],
    validate: false,
    ...(config.schemaFile ? { emitSchemaFile: config.schemaFile } : {}),
  });

  const apollo = new ApolloServer({ schema });
  await apollo.start();

  const app = express();
  app.use(cors());
  app.use(express.json());
  apollo.applyMiddleware({ app, path: '/graphql' });

  if (config.mongoUri) {
    await mongoose.connect(config.mongoUri);
    console.log('Connected to MongoDB');
  } else {
    console.warn('MONGODB_URI is not set; skipping database connection');
  }

  app.listen(config.port, () => {
    console.log(`🚀 GraphQL ready at http://localhost:${config.port}${apollo.graphqlPath}`);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start backend', error);
  process.exit(1);
});
