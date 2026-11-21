import { WorkflowTransitionConflictError } from '../../../core/workflow/errors';

/** A status change that lost a race: the run was already moved by a worker or another client. */
export const isLostTransitionRace = (error: unknown) =>
  error instanceof WorkflowTransitionConflictError ||
  (error instanceof Error && error.message === 'TRANSITION_NOT_FOUND');
