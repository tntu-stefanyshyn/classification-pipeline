import type { ComputationQueue } from '../../graphql/types.generated';

export type GraphNodeSetting = {
  key: string;
  value: string;
};

export type GraphNode = {
  _id: string;
  stage: string;
  technology: string;
  settings?: GraphNodeSetting[] | null;
};

export type HandlerPayload = {
  pipelineId: string;
  experiment_id: string;
  queue: ComputationQueue;
  backend_url?: string;
  file_id?: string | null;
  file_s3_bucket?: string;
  file_s3_key?: string;
  file_url?: string;
  path: Array<{
    node_id: string;
    stage: string;
    technology: string;
    settings: GraphNodeSetting[];
  }>;
};

export type HandlerEvent =
  | { type: 'progress'; progress?: number; message?: string }
  | { type: 'result'; result?: Record<string, unknown> }
  | { type: 'log'; message?: string }
  | { type: 'error'; message?: string };
