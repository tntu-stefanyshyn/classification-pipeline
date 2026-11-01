import { PipelineStatus } from '../../graphql/types.generated';

type RunState = { status?: PipelineStatus | null; executionId?: string | null };

/**
 * Whether the run is still the execution this worker claimed. A stopped run can be queued and
 * claimed again before the next poll, so `running` alone does not mean it is still ours.
 */
export const isCurrentExecution = (run: RunState, executionId: string) =>
  run.status === PipelineStatus.running && run.executionId === executionId;
