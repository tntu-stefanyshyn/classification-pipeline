import type {
  CompleteExperimentRunInput,
  ComputationQueue,
  PipelineMachineInfoInput,
  FailExperimentRunInput,
  UpdatePipelineInput,
} from '../../graphql/types.generated';
import {
  ClaimExperimentRunDocument,
  type ClaimExperimentRunMutation,
  type ClaimExperimentRunMutationVariables,
} from '../../graphql/mutations/generated/claimExperimentRun';
import {
  CompleteExperimentRunDocument,
  type CompleteExperimentRunMutation,
  type CompleteExperimentRunMutationVariables,
} from '../../graphql/mutations/generated/completeExperimentRun';
import {
  FailExperimentRunDocument,
  type FailExperimentRunMutation,
  type FailExperimentRunMutationVariables,
} from '../../graphql/mutations/generated/failExperimentRun';
import {
  UpdateExperimentRunDocument,
  type UpdateExperimentRunMutation,
  type UpdateExperimentRunMutationVariables,
} from '../../graphql/mutations/generated/updateExperimentRun';
import {
  ExperimentForRunDocument,
  type ExperimentForRunQuery,
  type ExperimentForRunQueryVariables,
} from '../../graphql/queries/generated/experimentForRun';
import {
  ExperimentRunDocument,
  type ExperimentRunQuery,
  type ExperimentRunQueryVariables,
} from '../../graphql/queries/generated/experimentRun';
import { GraphqlClient } from './graphqlClient';

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

export const fetchExperimentRun = async (client: GraphqlClient, runId: string) => {
  const data = await client.request<ExperimentRunQuery, ExperimentRunQueryVariables>(
    ExperimentRunDocument,
    { runId }
  );
  return data.experimentRun ?? null;
};

export const updateExperimentRun = async (client: GraphqlClient, input: UpdatePipelineInput) => {
  await client.request<UpdateExperimentRunMutation, UpdateExperimentRunMutationVariables>(
    UpdateExperimentRunDocument,
    { input }
  );
};

export const completeExperimentRun = async (
  client: GraphqlClient,
  input: CompleteExperimentRunInput
) => {
  await client.request<CompleteExperimentRunMutation, CompleteExperimentRunMutationVariables>(
    CompleteExperimentRunDocument,
    { input }
  );
};

export const failExperimentRun = async (client: GraphqlClient, input: FailExperimentRunInput) => {
  await client.request<FailExperimentRunMutation, FailExperimentRunMutationVariables>(
    FailExperimentRunDocument,
    { input }
  );
};
