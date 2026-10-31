import { buildSchemaSync } from 'type-graphql';

import { User } from './core/user';
import { Auth } from './modules/auth/graphql/Auth';
import { Health } from './graphql/Health';
import { ServerInfoApi } from './graphql/ServerInfo';
import { Experiments } from './modules/experiments/graphql/Experiments';
import { Technologies } from './modules/technologies/graphql/Technologies';
import { Storage } from './modules/storage/graphql/Storage';
import { Files } from './modules/files/graphql/Files';
import { ComputationResolver } from './modules/computations';
import { PipelineResolver } from './core/pipeline/graphql/pipeline';

/** Builds the GraphQL schema; with `emitSchemaFile` it also writes the SDL file. */
export const buildAppSchema = (emitSchemaFile?: string) =>
  buildSchemaSync({
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
    ...(emitSchemaFile ? { emitSchemaFile } : {}),
  });
