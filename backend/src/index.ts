import 'dotenv/config';
import 'reflect-metadata';
import { ApolloServer } from 'apollo-server-express';
import cors from 'cors';
import express from 'express';
import mongoose, { Types } from 'mongoose';
import { buildSchemaSync } from 'type-graphql';

import { User } from './core/user';
import { Auth } from './modules/auth/graphql/Auth';
import { Health } from './graphql/Health';
import { ServerInfoApi } from './graphql/ServerInfo';
import { Experiments } from './modules/experiments/graphql/Experiments';
import { ExperimentModel } from './modules/experiments/models/ExperimentModel';
import { PipelineModel } from './core/pipeline/models/PipelineModel';
import { GraphManager } from './modules/experiments/services/GraphManager';
import { buildGraphReportPdf } from './modules/experiments/utils/buildGraphReportPdf';
import { Technologies } from './modules/technologies/graphql/Technologies';
import { Storage } from './modules/storage/graphql/Storage';
import { Files } from './modules/files/graphql/Files';
import { config } from './config/config';
import { GraphQLContext } from './types/context';
import { runSeeders } from './seeders';
import { ComputationResolver } from './modules/computations';
import { PipelineResolver } from './core/pipeline/graphql/pipeline';

async function bootstrap() {
  // let cloudWorker: CloudComputationWorker | null = null;
  let shuttingDown = false;
  const schema = buildSchemaSync({
    resolvers: [
      Health,
      Auth,
      ServerInfoApi,
      Experiments,
      Technologies,
      Storage,
      Files,
      ComputationResolver,
      PipelineResolver,
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

  const graphManager = new GraphManager();
  app.get('/experiments/:experimentId/report', async (req, res) => {
    try {
      const experimentId = (req.params.experimentId ?? '').trim();
      if (!experimentId) {
        res.status(400).json({ error: 'Experiment _id is required' });
        return;
      }
      if (!Types.ObjectId.isValid(experimentId)) {
        res.status(400).json({ error: 'Experiment _id is invalid' });
        return;
      }

      const experiment = await ExperimentModel.findById(experimentId).lean();
      if (!experiment) {
        res.status(404).json({ error: 'Experiment not found' });
        return;
      }

      const graph = await graphManager.getByExperimentId(experimentId);
      const pipelines = await PipelineModel.find({ experimentId }).lean();
      const report = await buildGraphReportPdf({
        experimentId,
        experimentName: experiment.name,
        createdAt: experiment.createdAt ? new Date(experiment.createdAt) : undefined,
        nodes: graph.nodes ?? [],
        pipelines: pipelines.map((pipeline) => ({
          _id: String(pipeline._id),
          queue: pipeline.queue,
          pathNodeIds: (pipeline.pathNodeIds ?? []).map((id: any) => String(id)),
          computingResult: pipeline.computingResult as any,
          optimizationScores: pipeline.optimizationScores as number[] | undefined,
          machineInfo: pipeline.machineInfo as any,
          createdAt: pipeline.createdAt ? new Date(pipeline.createdAt) : undefined,
          updatedAt: pipeline.updatedAt ? new Date(pipeline.updatedAt) : undefined,
        })),
        optimization: experiment.optimization
          ? {
              bestPipelineId: experiment.optimization.bestPipelineId?.toString(),
              bestScore: experiment.optimization.bestScore ?? undefined,
              progress: experiment.optimization.progress ?? undefined,
              status: experiment.optimization.status ?? undefined,
              history:
                (experiment.optimization.history as any[])?.map((item) => ({
                  createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
                  message: item.message,
                  status: item.status,
                })) ?? [],
            }
          : undefined,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="experiment-${experimentId}-report.pdf"`
      );
      res.status(200).send(report);
    } catch (error) {
      console.error('Failed to generate experiment report', error);
      res.status(500).json({ error: 'Failed to generate experiment report' });
    }
  });

  if (config.mongoUri) {
    await mongoose.connect(config.mongoUri);
    console.log('Connected to MongoDB');
    await runSeeders();
    // cloudWorker = new CloudComputationWorker();
    // cloudWorker.start();
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
      // cloudWorker?.stop();
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
  console.error('Failed to start backend', error);
  process.exit(1);
});
