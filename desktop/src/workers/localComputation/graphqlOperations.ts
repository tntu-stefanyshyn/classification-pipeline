import type {
  ChangePipelineStatusInput,
  ComputationQueue,
  PipelineMachineInfoInput,
} from '../../graphql/types.generated';
import {
  ClaimExperimentRunDocument,
  type ClaimExperimentRunMutation,
  type ClaimExperimentRunMutationVariables,
} from '../../graphql/mutations/generated/claimExperimentRun';
import {
  ExperimentForRunDocument,
  type ExperimentForRunQuery,
  type ExperimentForRunQueryVariables,
} from '../../graphql/queries/generated/experimentForRun';
import {
  PipelineDocument,
  type PipelineQuery,
  type PipelineQueryVariables,
} from '../../graphql/queries/generated/pipeline';
import { GraphqlClient } from './graphqlClient';
import {
  ChangePipelineStatusDocument,
  ChangePipelineStatusMutation,
  ChangePipelineStatusMutationVariables,
} from '../../components/experiments/ComputationCard/components/ChangePipelineStatusButton/graphql/mutations/generated/ChangePipelineStatus';

export const claimExperimentRun = async (
  client: GraphqlClient,
  queue: ComputationQueue,
  machineInfo?: PipelineMachineInfoInput
) => {
  const data = await client.request<
    ClaimExperimentRunMutation,
    ClaimExperimentRunMutationVariables
  >(ClaimExperimentRunDocument, { queue, machineInfo });
  return data.claimExperimentRun ?? null;
};

export const fetchExperimentForRun = async (client: GraphqlClient, id: string) => {
  const data = await client.request<ExperimentForRunQuery, ExperimentForRunQueryVariables>(
    ExperimentForRunDocument,
    { id }
  );
  return data.experiment ?? null;
};

export const fetchExperimentRun = async (client: GraphqlClient, pipelineId: string) => {
  const data = await client.request<PipelineQuery, PipelineQueryVariables>(PipelineDocument, {
    pipelineId,
  });
  return data.pipeline ?? null;
};

export const changePipelineStatus = async (
  client: GraphqlClient,
  input: ChangePipelineStatusInput
) => {
  await client.request<ChangePipelineStatusMutation, ChangePipelineStatusMutationVariables>(
    ChangePipelineStatusDocument,
    { input }
  );
};
