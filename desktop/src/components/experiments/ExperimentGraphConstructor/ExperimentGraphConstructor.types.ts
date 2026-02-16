import type { Edge, Node } from 'reactflow';
import type { ClassificationStage, Technology } from './graphql';

export type ExperimentGraphConstructorProps = {
  experimentId: string;
};

export type NodeModalState =
  | { type: 'add'; parentId: string | null }
  | { type: 'edit'; nodeId: string }
  | { type: 'delete'; nodeId: string }
  | null;

export type NodeDraft = {
  stage: ClassificationStage;
  technologyName: string;
  settings: Record<string, string>;
};

export type GraphFlowNodeData = {
  _id: string;
  label: string;
  stage?: ClassificationStage | null;
  isRoot?: boolean;
  isActive: boolean;
  hasChildren?: boolean;
  isCollapsed?: boolean;
  collapsedChildrenCount?: number;
  graphActionsDisabled: boolean;
  graphUpdating: boolean;
  onAdd: (parentId: string | null) => void;
  onEdit: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onToggleCollapse: (nodeId: string) => void;
};

export type GraphFlowNode = Node<GraphFlowNodeData>;
export type GraphFlowEdge = Edge;

export type StageSelection = Partial<Record<ClassificationStage, string[]>>;

export type FlatGraphNode = {
  _id: string;
  label: string;
  stage?: ClassificationStage | null;
  technology?: string | null;
  type: string;
  settings?: Record<string, string>;
  parentId?: string | null;
  isRoot?: boolean;
};

export type TechnologyIndex = {
  byStage: Map<ClassificationStage, Technology[]>;
  byStageName: Map<string, Technology>;
};

export type BuildFlowElementsParams = {
  nodes: FlatGraphNode[];
  selectedNodeId: string | null;
  collapsedNodeIds: Set<string>;
  graphActionsDisabled: boolean;
  graphUpdating: boolean;
  onAdd: (parentId: string | null) => void;
  onEdit: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onToggleCollapse: (nodeId: string) => void;
};

export type FlowElementsResult = {
  flowNodes: GraphFlowNode[];
  flowEdges: GraphFlowEdge[];
};
