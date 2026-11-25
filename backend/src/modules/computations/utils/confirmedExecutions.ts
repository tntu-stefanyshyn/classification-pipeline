import { PipelineStatus } from '../../../core/pipeline/enums';
import { ConfirmedRunInput } from '../classes/ConfirmedRunInput';

type Seen = { executionId: number | null; status?: PipelineStatus | null };

/** What the user saw of each confirmed pipeline, by pipeline id. */
export const confirmedExecutions = (runs: ConfirmedRunInput[]) =>
  new Map<string, Seen>(
    runs.map((run) => [
      String(run.pipelineId),
      {
        executionId:
          run.executionId === null || run.executionId === undefined || run.executionId === ''
            ? null
            : Number(run.executionId),
        status: run.status,
      },
    ])
  );

/**
 * Whether the pipeline is still the run the user confirmed: the same execution, or, for a run the
 * user saw `queued`, the execution a worker started by taking it. Any other execution means the
 * run was stopped and started again meanwhile.
 */
export const isConfirmedExecution = (
  confirmed: Map<string, Seen>,
  pipelineId: unknown,
  status: PipelineStatus,
  executionId: number | undefined
) => {
  const seen = confirmed.get(String(pipelineId));
  if (!seen) return false;
  const current = executionId ?? null;
  if (current === seen.executionId) return true;
  return (
    seen.status === PipelineStatus.queued &&
    status === PipelineStatus.running &&
    current === (seen.executionId ?? 0) + 1
  );
};
