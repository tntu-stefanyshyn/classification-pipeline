import { registerEnumType } from 'type-graphql';

export enum PipelineStatus {
  idle = 'idle',
  queued = 'queued',
  running = 'running',
  completed = 'completed',
}

registerEnumType(PipelineStatus, {
  name: 'PipelineStatus',
  description: 'Status of a pipeline (a run of one graph path in one queue).',
  valuesConfig: {
    idle: {
      description:
        'No active run. The initial status, and the one a run returns to when it is stopped, paused or fails.',
    },
    queued: { description: 'Waiting in its queue for a worker to claim it.' },
    running: { description: 'Claimed by a worker and being computed.' },
    completed: { description: 'Finished successfully; the result is saved.' },
  },
});
