import 'dotenv/config';
import 'reflect-metadata';
import { ApolloServer } from 'apollo-server-express';
import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import { buildSchema } from 'type-graphql';

import { User } from './core/user';
import { AuthResolver } from './modules/auth/graphql/auth.resolver';
import { HealthResolver } from './graphql/health.resolver';
import { ServerInfoResolver } from './graphql/serverInfo.resolver';
import { config } from './config/config';
import { GraphQLContext } from './types/context';

async function bootstrap() {
  const schema = await buildSchema({
    resolvers: [HealthResolver, AuthResolver, ServerInfoResolver],
    orphanedTypes: [User],
    validate: false,
    ...(config.schemaFile ? { emitSchemaFile: config.schemaFile } : {}),
  });

  const apollo = new ApolloServer({
    schema,
    context: ({ req, res }): GraphQLContext => ({ req, res }),
  });
  await apollo.start();

  const app = express();
  app.use(cors());
  app.use(express.json());
  apollo.applyMiddleware({ app: app as any, path: '/graphql' });

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
