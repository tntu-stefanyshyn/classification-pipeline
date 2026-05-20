import { Position } from 'reactflow';
import type {
  BuildFlowElementsParams,
  FlowElementsResult,
  GraphFlowEdge,
  GraphFlowNode,
} from '../ExperimentGraphConstructor.types';
import { ROOT_NODE_ID, ROOT_NODE_LABEL } from '../constants/graph';
import { getStageLabel } from './stage';

const TITLE_CHARS_PER_LINE = 28;
const TITLE_LINE_HEIGHT = 18;
const NODE_BASE_HEIGHT = 86;
const COLLAPSED_META_HEIGHT = 18;
const NODE_WIDTH = 220;
const HORIZONTAL_SIBLING_GAP = 40;
const VERTICAL_LEVEL_GAP = 180;

export const applyFlowNodePositionOverrides = (
  nodes: GraphFlowNode[],
  overrides: Record<string, { x: number; y: number }>,
  isDraggable: boolean
): GraphFlowNode[] =>
  nodes.map((node) => ({
    ...node,
    position: overrides[node.id] ?? node.position,
    draggable: node.id === ROOT_NODE_ID ? false : isDraggable,
  }));

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
  const subtreeWidths = new Map<string, number>();
  const nodeHeights = new Map<string, number>();
  const nodeWidths = new Map<string, number>();

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

  const estimateNodeWidth = () => NODE_WIDTH;

  const measure = (nodeId: string): number => {
    const children = childrenByParent.get(nodeId) ?? [];
    const nodeHeight = estimateNodeHeight(nodeId);
    const nodeWidth = estimateNodeWidth();
    nodeHeights.set(nodeId, nodeHeight);
    nodeWidths.set(nodeId, nodeWidth);

    if (children.length === 0) {
      subtreeWidths.set(nodeId, nodeWidth);
      return nodeWidth;
    }

    const childrenWidth = children.reduce((total, childId, index) => {
      const childWidth = measure(childId);
      return total + childWidth + (index > 0 ? HORIZONTAL_SIBLING_GAP : 0);
    }, 0);

    const subtreeWidth = Math.max(nodeWidth, childrenWidth);
    subtreeWidths.set(nodeId, subtreeWidth);
    return subtreeWidth;
  };

  const layout = (nodeId: string, depth: number, leftX: number) => {
    const children = childrenByParent.get(nodeId) ?? [];
    const subtreeWidth = subtreeWidths.get(nodeId) ?? estimateNodeWidth();
    const nodeWidth = nodeWidths.get(nodeId) ?? estimateNodeWidth();
    const nodeLeft = leftX + (subtreeWidth - nodeWidth) / 2;
    positions.set(nodeId, { x: nodeLeft, y: depth * VERTICAL_LEVEL_GAP });

    if (children.length === 0) return;

    const childrenTotalWidth = children.reduce((total, childId, index) => {
      const childSubtreeWidth = subtreeWidths.get(childId) ?? measure(childId);
      return total + childSubtreeWidth + (index > 0 ? HORIZONTAL_SIBLING_GAP : 0);
    }, 0);

    let childLeft = leftX + (subtreeWidth - childrenTotalWidth) / 2;
    children.forEach((childId) => {
      layout(childId, depth + 1, childLeft);
      childLeft += (subtreeWidths.get(childId) ?? 0) + HORIZONTAL_SIBLING_GAP;
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
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    },
  ];

  visibleNodes.forEach((node) => {
    const hasChildren = (childrenByParentAll.get(node._id)?.length ?? 0) > 0;
    const isCollapsed = hasChildren && collapsedNodeIds.has(node._id);
    const position = positions.get(node._id) ?? { x: 0, y: VERTICAL_LEVEL_GAP };
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
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
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
