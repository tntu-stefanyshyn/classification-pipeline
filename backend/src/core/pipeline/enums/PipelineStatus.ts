import { registerEnumType } from 'type-graphql';

export enum PipelineStatus {
  idle = 'idle',
  queued = 'queued',
  running = 'running',
  paused = 'paused',
  failed = 'failed',
  stopped = 'stopped',
  completed = 'completed',
}

registerEnumType(PipelineStatus, { name: 'PipelineStatus' });
