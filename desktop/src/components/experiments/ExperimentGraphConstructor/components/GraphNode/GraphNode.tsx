import { Handle, Position } from 'reactflow';
import type { FC } from 'react';
import { stageLabels } from '../../constants/stages';
import { getStageLabel } from '../../utils/stage';
import { ClassificationStage } from '../../graphql';
import type { GraphNodeProps } from './GraphNode.types';

const GraphNode: FC<GraphNodeProps> = ({ data }) => {
  if (data.isRoot) {
    const rootClassName = `org-node root${data.isActive ? ' active' : ''}`;
    const addDisabled = data.graphActionsDisabled;
    return (
      <div className={rootClassName}>
        <Handle type="source" position={Position.Right} className="graph-node-handle" />
        <div className="org-node-body">
          <span className="org-node-title">{data.label}</span>
          <span className="org-node-meta">старт</span>
        </div>
        <div className="org-node-actions">
          <button
            className="btn ghost small icon"
            type="button"
            onClick={() => data.onAdd(null)}
            disabled={addDisabled}
            aria-label="Додати вузол"
            title="Додати вузол"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 5v14M5 12h14"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.6"
              />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  const title = data.label || getStageLabel(data.stage);
  const stageLabel = data.stage ? stageLabels[data.stage] : null;
  const meta = stageLabel ?? getStageLabel(data.stage);
  const className = `org-node${data.isActive ? ' active' : ''}${data.isCollapsed ? ' collapsed' : ''}`;
  const addDisabled = data.graphActionsDisabled;
  const inspectDisabled = data.graphInspectionDisabled;
  const canAddChild = data.stage !== ClassificationStage.CLASSIFICATION;
  const canToggleCollapse = Boolean(data.hasChildren || data.isCollapsed);
  const collapseLabel = data.isCollapsed ? 'Розгорнути гілку' : 'Згорнути гілку';
  const inspectLabel = data.graphActionsDisabled ? 'Переглянути вузол' : 'Редагувати вузол';

  return (
    <div className={className}>
      <Handle type="target" position={Position.Left} className="graph-node-handle" />
      <Handle type="source" position={Position.Right} className="graph-node-handle" />
      <button
        type="button"
        className="org-node-body"
        onClick={() => data.onEdit(data._id)}
        aria-label={inspectLabel}
      >
        <span className="org-node-title" title={title}>
          {title}
        </span>
        <span className="org-node-meta">{meta}</span>
        {data.isCollapsed ? (
          <span className="org-node-state">
            згорнуто
            {data.collapsedChildrenCount ? `: ${data.collapsedChildrenCount}` : ''}
          </span>
        ) : null}
      </button>
      <div className="org-node-actions">
        {canToggleCollapse ? (
          <button
            className="btn ghost small icon"
            type="button"
            onClick={() => data.onToggleCollapse(data._id)}
            disabled={data.graphUpdating}
            aria-label={collapseLabel}
            title={collapseLabel}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {data.isCollapsed ? (
                <path
                  d="M9 6l6 6-6 6"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.6"
                />
              ) : (
                <path
                  d="M6 9l6 6 6-6"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.6"
                />
              )}
            </svg>
          </button>
        ) : null}
        {canAddChild ? (
          <button
            className="btn ghost small icon"
            type="button"
            onClick={() => data.onAdd(data._id)}
            disabled={addDisabled}
            aria-label="Додати дочірній вузол"
            title="Додати дочірній вузол"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 5v14M5 12h14"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.6"
              />
            </svg>
          </button>
        ) : null}
        <button
          className="btn ghost small icon"
          type="button"
          onClick={() => data.onEdit(data._id)}
          disabled={inspectDisabled}
          aria-label={inspectLabel}
          title={inspectLabel}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M4 16.25V20h3.75L19.81 7.94l-3.75-3.75L4 16.25z"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
            />
          </svg>
        </button>
        <button
          className="btn ghost small icon"
          type="button"
          onClick={() => data.onDelete(data._id)}
          disabled={data.graphActionsDisabled}
          aria-label="Видалити вузол"
          title="Видалити вузол"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M6 7h12M9 7V5h6v2m-7 3v8m4-8v8m4-8v8"
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

export default GraphNode;
