import { PipelineStatus } from '../../../core/pipeline/enums';
import { ConfirmedRunInput } from '../classes/ConfirmedRunInput';

type Seen = {
  executionId: number | null;
  status?: PipelineStatus | null;
  admissionId?: string | null;
};

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
        admissionId: run.admissionId,
      },
    ])
  );

/**
 * Whether the pipeline is still the run the user confirmed. With `admissionId` (sent by the
 * desktop), the pipeline must still be in the queue admission the user saw: every move to `queued`
 * makes a new one, so a run stopped and queued again is a different request even before a worker
 * takes it. Within the admission, the execution must be the one seen, or, for a run seen `queued`,
 * the execution a worker started by taking it. Without `admissionId` (older clients) only the
 * execution is compared.
 */
export const isConfirmedExecution = (
  confirmed: Map<string, Seen>,
  pipelineId: unknown,
  status: PipelineStatus,
  executionId: number | undefined,
  admissionId?: string
) => {
  const seen = confirmed.get(String(pipelineId));
  if (!seen) return false;
  // `null` is an admission the user saw as missing (queued before admissions existed); only an
  // absent field, from an older client, skips the comparison.
  if (seen.admissionId !== undefined && (seen.admissionId ?? null) !== (admissionId ?? null)) {
    return false;
  }
  const current = executionId ?? null;
  if (current === seen.executionId) return true;
  return (
    seen.status === PipelineStatus.queued &&
    status === PipelineStatus.running &&
    current === (seen.executionId ?? 0) + 1
  );
};
