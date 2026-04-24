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

const TITLE_CHARS_PER_LINE = 28;
const TITLE_LINE_HEIGHT = 18;
const NODE_BASE_HEIGHT = 86;
const COLLAPSED_META_HEIGHT = 18;

export const buildFlowElements = ({
  nodes,
  selectedNodeId,
  collapsedNodeIds,
  graphActionsDisabled,
  graphInspectionDisabled,
  graphUpdating,
  onAdd,
  onEdit,
  onDelete,
  onToggleCollapse,
}: BuildFlowElementsParams): FlowElementsResult => {
  const nodeMap = new Map<string, (typeof nodes)[number]>();
  nodes.forEach((node) => {
    nodeMap.set(node._id, node);
  });

  const childrenByParentAll = new Map<string, string[]>();
  nodes.forEach((node) => {
    const parentId = node.parentId && nodeMap.has(node.parentId) ? node.parentId : ROOT_NODE_ID;
    const list = childrenByParentAll.get(parentId) ?? [];
    list.push(node._id);
    childrenByParentAll.set(parentId, list);
  });

  const getDescendantCount = (() => {
    const cache = new Map<string, number>();
    const countDescendants = (nodeId: string): number => {
      const cached = cache.get(nodeId);
      if (typeof cached === 'number') return cached;
      const children = childrenByParentAll.get(nodeId) ?? [];
      const count = children.reduce((total, childId) => total + 1 + countDescendants(childId), 0);
      cache.set(nodeId, count);
      return count;
    };
    return countDescendants;
  })();

  const isHiddenByCollapsedAncestor = (nodeId: string) => {
    let current = nodeMap.get(nodeId);
    while (current?.parentId) {
      if (collapsedNodeIds.has(current.parentId)) return true;
      current = nodeMap.get(current.parentId);
    }
    return false;
  };

  const visibleNodes = nodes.filter((node) => !isHiddenByCollapsedAncestor(node._id));
  const visibleNodeIds = new Set(visibleNodes.map((node) => node._id));
  const childrenByParent = new Map<string, string[]>();
  visibleNodes.forEach((node) => {
    const parentId =
      node.parentId && visibleNodeIds.has(node.parentId) ? node.parentId : ROOT_NODE_ID;
    const list = childrenByParent.get(parentId) ?? [];
    list.push(node._id);
    childrenByParent.set(parentId, list);
  });

  const positions = new Map<string, { x: number; y: number }>();
  const subtreeHeights = new Map<string, number>();
  const nodeHeights = new Map<string, number>();

  const estimateNodeHeight = (nodeId: string) => {
    const hasChildren = (childrenByParentAll.get(nodeId)?.length ?? 0) > 0;
    const isCollapsed = hasChildren && collapsedNodeIds.has(nodeId);
    const label =
      nodeId === ROOT_NODE_ID
        ? ROOT_NODE_LABEL
        : nodeMap.get(nodeId)?.label || getStageLabel(nodeMap.get(nodeId)?.stage ?? null);
    const lineCount = Math.max(1, Math.ceil((label?.length ?? 0) / TITLE_CHARS_PER_LINE));
    const collapsedMetaHeight = isCollapsed ? COLLAPSED_META_HEIGHT : 0;
    return NODE_BASE_HEIGHT + (lineCount - 1) * TITLE_LINE_HEIGHT + collapsedMetaHeight;
  };

  const measure = (nodeId: string): number => {
    const children = childrenByParent.get(nodeId) ?? [];
    const nodeHeight = estimateNodeHeight(nodeId);
    nodeHeights.set(nodeId, nodeHeight);

    if (children.length === 0) {
      subtreeHeights.set(nodeId, nodeHeight);
      return nodeHeight;
    }

    const childrenHeight = children.reduce((total, childId, index) => {
      const childHeight = measure(childId);
      return total + childHeight + (index > 0 ? FLOW_VERTICAL_GAP : 0);
    }, 0);

    const subtreeHeight = Math.max(nodeHeight, childrenHeight);
    subtreeHeights.set(nodeId, subtreeHeight);
    return subtreeHeight;
  };

  const layout = (nodeId: string, depth: number, topY: number) => {
    const children = childrenByParent.get(nodeId) ?? [];
    const subtreeHeight = subtreeHeights.get(nodeId) ?? estimateNodeHeight(nodeId);
    const nodeHeight = nodeHeights.get(nodeId) ?? estimateNodeHeight(nodeId);
    const nodeTop = topY + (subtreeHeight - nodeHeight) / 2;
    positions.set(nodeId, { x: depth * FLOW_HORIZONTAL_GAP, y: nodeTop });

    if (children.length === 0) return;

    const childrenTotalHeight = children.reduce((total, childId, index) => {
      const childSubtreeHeight = subtreeHeights.get(childId) ?? measure(childId);
      return total + childSubtreeHeight + (index > 0 ? FLOW_VERTICAL_GAP : 0);
    }, 0);

    let childTop = topY + (subtreeHeight - childrenTotalHeight) / 2;
    children.forEach((childId) => {
      layout(childId, depth + 1, childTop);
      childTop += (subtreeHeights.get(childId) ?? 0) + FLOW_VERTICAL_GAP;
    });
  };

  measure(ROOT_NODE_ID);
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
        graphInspectionDisabled,
        graphUpdating,
        onAdd,
        onEdit,
        onDelete,
        onToggleCollapse,
      },
      draggable: false,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    },
  ];

  visibleNodes.forEach((node) => {
    const hasChildren = (childrenByParentAll.get(node._id)?.length ?? 0) > 0;
    const isCollapsed = hasChildren && collapsedNodeIds.has(node._id);
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
        hasChildren,
        isCollapsed,
        collapsedChildrenCount: isCollapsed ? getDescendantCount(node._id) : 0,
        graphActionsDisabled,
        graphInspectionDisabled,
        graphUpdating,
        onAdd,
        onEdit,
        onDelete,
        onToggleCollapse,
      },
      draggable: false,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
  });

  const flowEdges: GraphFlowEdge[] = visibleNodes
    .map((node) => {
      const parentId =
        node.parentId && visibleNodeIds.has(node.parentId) ? node.parentId : ROOT_NODE_ID;
      return {
        id: `edge-${parentId}-${node._id}`,
        source: parentId,
        target: node._id,
        type: 'smoothstep',
      };
    })
    .filter((edge) => edge.source !== edge.target);

  return { flowNodes, flowEdges };
};
