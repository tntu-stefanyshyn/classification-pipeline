import { Handle, Position, type NodeProps } from 'reactflow';
import type { FC } from 'react';
import {
  getStageLabel,
  type ClassificationStage,
} from '../../../../../components/experiments/ExperimentGraphConstructor';

export type NodeRunStatus = 'idle' | 'queued' | 'running' | 'paused' | 'failed' | 'completed';

export type StatusGraphNodeData = {
  _id: string;
  label: string;
  stage?: ClassificationStage | null;
  status: NodeRunStatus;
  isRoot?: boolean;
  onInfo: (nodeId: string) => void;
};

const StatusGraphNode: FC<NodeProps<StatusGraphNodeData>> = ({ data }) => {
  if (data.isRoot) {
    return (
      <div className={`org-node root status-node status-${data.status}`}>
        <Handle type="source" position={Position.Right} className="graph-node-handle" />
        <div className="org-node-body">
          <span className="org-node-title">{data.label}</span>
          <span className="org-node-meta">старт</span>
        </div>
      </div>
    );
  }

  const title = data.label || getStageLabel(data.stage);
  const meta = getStageLabel(data.stage);

  return (
    <div className={`org-node status-node status-${data.status}`}>
      <Handle type="target" position={Position.Left} className="graph-node-handle" />
      <Handle type="source" position={Position.Right} className="graph-node-handle" />
      <div className="org-node-body">
        <span className="org-node-title">{title}</span>
        <span className="org-node-meta">{meta}</span>
      </div>
      <div className="org-node-actions">
        <button
          className="btn ghost small icon"
          type="button"
          onClick={() => data.onInfo(data._id)}
          aria-label="Переглянути стан вузла"
          title="Переглянути стан вузла"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M12 11v5m0-9h.01"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default StatusGraphNode;
