import { Position } from 'reactflow';
import type {
  BuildFlowElementsParams,
  FlowElementsResult,
  GraphFlowEdge,
  GraphFlowNode,
} from '../ExperimentGraphConstructor.types';
import {
  FLOW_HORIZONTAL_GAP,
  FLOW_VERTICAL_GAP,
  ROOT_NODE_ID,
  ROOT_NODE_LABEL,
} from '../constants/graph';
import { getStageLabel } from './stage';

export const buildFlowElements = ({
  nodes,
  selectedNodeId,
  graphActionsDisabled,
  graphUpdating,
  onAdd,
  onEdit,
  onDelete,
}: BuildFlowElementsParams): FlowElementsResult => {
  const nodeMap = new Map<string, { parentId?: string | null }>();
  nodes.forEach((node) => {
    nodeMap.set(node._id, node);
  });

  const childrenByParent = new Map<string, string[]>();
  nodes.forEach((node) => {
    const parentId = node.parentId && nodeMap.has(node.parentId) ? node.parentId : ROOT_NODE_ID;
    const list = childrenByParent.get(parentId) ?? [];
    list.push(node._id);
    childrenByParent.set(parentId, list);
  });

  const positions = new Map<string, { x: number; y: number }>();

  const layout = (nodeId: string, depth: number, startY: number) => {
    const children = childrenByParent.get(nodeId) ?? [];
    if (children.length === 0) {
      const y = startY;
      positions.set(nodeId, { x: depth * FLOW_HORIZONTAL_GAP, y });
      return { nextY: startY + FLOW_VERTICAL_GAP, centerY: y };
    }

    let currentY = startY;
    let firstCenter = startY;
    let lastCenter = startY;

    children.forEach((childId, index) => {
      const result = layout(childId, depth + 1, currentY);
      currentY = result.nextY;
      if (index === 0) firstCenter = result.centerY;
      lastCenter = result.centerY;
    });

    const centerY = (firstCenter + lastCenter) / 2;
    positions.set(nodeId, { x: depth * FLOW_HORIZONTAL_GAP, y: centerY });
    return { nextY: currentY, centerY };
  };

  layout(ROOT_NODE_ID, 0, 0);

  const rootPosition = positions.get(ROOT_NODE_ID) ?? { x: 0, y: 0 };
  const flowNodes: GraphFlowNode[] = [
    {
      id: ROOT_NODE_ID,
      type: 'graphNode',
      position: rootPosition,
      data: {
        _id: ROOT_NODE_ID,
        label: ROOT_NODE_LABEL,
        stage: null,
        isRoot: true,
        isActive: selectedNodeId === ROOT_NODE_ID,
        graphActionsDisabled,
        graphUpdating,
        onAdd,
        onEdit,
        onDelete,
      },
      draggable: false,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    },
  ];

  nodes.forEach((node) => {
    const position = positions.get(node._id) ?? { x: FLOW_HORIZONTAL_GAP, y: 0 };
    flowNodes.push({
      id: node._id,
      type: 'graphNode',
      position,
      data: {
        _id: node._id,
        label: node.label || getStageLabel(node.stage),
        stage: node.stage ?? null,
        isRoot: false,
        isActive: selectedNodeId === node._id,
        graphActionsDisabled,
        graphUpdating,
        onAdd,
        onEdit,
        onDelete,
      },
      draggable: false,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
  });

  const flowEdges: GraphFlowEdge[] = nodes.map((node) => {
    const parentId = node.parentId && nodeMap.has(node.parentId) ? node.parentId : ROOT_NODE_ID;
    return {
      id: `edge-${parentId}-${node._id}`,
      source: parentId,
      target: node._id,
      type: 'smoothstep',
    };
  });

  return { flowNodes, flowEdges };
};
