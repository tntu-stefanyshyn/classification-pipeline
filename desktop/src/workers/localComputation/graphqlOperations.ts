import type {
  ComputationQueue,
  FailExperimentRunInput,
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
  FailExperimentRunDocument,
  type FailExperimentRunMutation,
  type FailExperimentRunMutationVariables,
} from '../../graphql/mutations/generated/failExperimentRun';

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

// The backend ignores the failure if `input.executionId` is no longer the run's execution.
export const failExperimentRun = async (client: GraphqlClient, input: FailExperimentRunInput) => {
  await client.request<FailExperimentRunMutation, FailExperimentRunMutationVariables>(
    FailExperimentRunDocument,
    { input }
  );
};
