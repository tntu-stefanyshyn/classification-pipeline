import { registerEnumType } from 'type-graphql';

export enum PipelineStatus {
  idle = 'idle',
  queued = 'queued',
  running = 'running',
  completed = 'completed',
}

registerEnumType(PipelineStatus, { name: 'PipelineStatus' });
