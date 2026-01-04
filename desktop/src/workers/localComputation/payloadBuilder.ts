import type { ClaimExperimentRunMutation } from '../../graphql/mutations/generated/claimExperimentRun';
import type { ExperimentForRunQuery } from '../../graphql/queries/generated/experimentForRun';
import type { HandlerPayload } from './types';

type ClaimedRun = NonNullable<ClaimExperimentRunMutation['claimExperimentRun']>;
type ExperimentSnapshot = NonNullable<ExperimentForRunQuery['experiment']>;

export const buildHandlerPayload = (
  run: ClaimedRun,
  experiment: ExperimentSnapshot
): HandlerPayload => {
  const nodes = experiment.graph?.nodes ?? [];
  if (nodes.length === 0) {
    throw new Error('Experiment graph is empty');
  }

  const nodeMap = new Map(nodes.map((node) => [node._id, node]));
  const pathNodes = run.pathNodeIds.map((nodeId) => nodeMap.get(nodeId) ?? null);
  if (pathNodes.some((node) => !node)) {
    throw new Error('Graph path nodes are missing');
  }

  return {
    pipelineId: run._id,
    experiment_id: run.experimentId,
    queue: run.queue,
    file_id: experiment.fileId ?? null,
    path: pathNodes.map((node) => ({
      node_id: String(node?._id ?? ''),
      stage: String(node?.stage ?? ''),
      technology: String(node?.technology ?? ''),
      settings: (node?.settings ?? []).map((setting) => ({
        key: String(setting.key ?? ''),
        value: String(setting.value ?? ''),
      })),
    })),
  };
};
