import 'reflect-metadata';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import { buildSchema } from 'type-graphql';

import { User } from './entities/User';
import { HealthResolver } from './resolvers/health';

async function bootstrap() {
  const schema = await buildSchema({
    resolvers: [HealthResolver],
    orphanedTypes: [User],
    validate: false,
  });

  const apollo = new ApolloServer({ schema });
  await apollo.start();

  const app = express();
  app.use(cors());
  app.use('/graphql', express.json(), expressMiddleware(apollo));

  const mongoUri = process.env.MONGODB_URI;
  if (mongoUri) {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');
  } else {
    console.warn('MONGODB_URI is not set; skipping database connection');
  }

  const port = Number(process.env.PORT) || 4000;
  app.listen(port, () => {
    console.log(`🚀 GraphQL ready at http://localhost:${port}/graphql`);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start backend', error);
  process.exit(1);
});
