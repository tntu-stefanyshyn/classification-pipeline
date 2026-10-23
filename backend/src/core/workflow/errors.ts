/** A status change lost a race: another caller moved the workflow after it was read. */
export class WorkflowTransitionConflictError extends Error {
  constructor() {
    super('TRANSITION_CONFLICT');
    this.name = 'WorkflowTransitionConflictError';
  }
}
