import type { ApolloServer } from 'apollo-server-express';
import express from 'express';

import { createExperimentReportHandler } from './modules/experiments/rest/experimentReport';
import { createCors } from './utils/cors';

/** The HTTP app: CORS for the configured origins, GraphQL at /graphql and the REST report. */
export const createHttpApp = (
  apollo: ApolloServer,
  reportHandler = createExperimentReportHandler()
) => {
  const app = express();
  app.use(createCors());
  app.use(express.json());
  // `cors: false`: Apollo's own default is `cors()`, which would allow every origin on /graphql.
  apollo.applyMiddleware({ app: app as any, path: '/graphql', cors: false });
  app.get('/experiments/:experimentId/report', reportHandler);
  return app;
};
