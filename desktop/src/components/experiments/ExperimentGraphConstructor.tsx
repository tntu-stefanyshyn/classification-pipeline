import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ReactFlow, { Handle, Position, type Edge, type Node, type NodeProps } from 'reactflow';
import { useExperimentQuery } from '../../graphql/queries/generated/experiment';
import { useTechnologiesQuery } from '../../graphql/queries/generated/technologies';
import { useUpdateExperimentMutation } from '../../graphql/mutations/generated/updateExperiment';
import { ClassificationStage, TechnologySettingType } from '../../graphql/types.generated';
import type {
  GraphNodeSetting,
  GraphNodeSettingInput,
  Technology,
  TechnologySetting,
} from '../../graphql/types.generated';
import { Modal } from '../ui/Modal';

type ExperimentGraphConstructorProps = {
  experimentId: string;
};

type NodeModalState =
  | { type: 'add'; parentId: string | null }
  | { type: 'edit'; nodeId: string }
  | { type: 'delete'; nodeId: string }
  | null;

type NodeDraft = {
  stage: ClassificationStage;
  technologyName: string;
  settings: Record<string, string>;
};

type GraphFlowNodeData = {
  _id: string;
  label: string;
  stage?: ClassificationStage | null;
  isRoot?: boolean;
  isActive: boolean;
  graphActionsDisabled: boolean;
  graphUpdating: boolean;
  onAdd: (parentId: string | null) => void;
  onEdit: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
};

type GraphFlowNode = Node<GraphFlowNodeData>;
type GraphFlowEdge = Edge;

export function ExperimentGraphConstructor({ experimentId }: ExperimentGraphConstructorProps) {
  const { data, loading, error } = useExperimentQuery({
    variables: { _id: experimentId },
    skip: !experimentId,
    fetchPolicy: 'cache-and-network',
  });
  const {
    data: technologiesData,
    loading: technologiesLoading,
    error: technologiesError,
  } = useTechnologiesQuery();
  const [updateGraph, { loading: graphUpdating, error: graphUpdateError }] =
    useUpdateExperimentMutation();

  const experiment = data?.experiment;
  const technologies = technologiesData?.technologies ?? [];
  const technologiesKey = useMemo(
    () =>
      technologies
        .map((technology) => {
          const settingsKey = technology.settings
            .map((setting) => {
              const options = setting.options?.join(',') ?? '';
              return `${setting.key}:${setting.type}:${setting.defaultValue ?? ''}:${
                setting.required ? '1' : '0'
              }:${options}`;
            })
            .join('|');
          return `${technology._id}:${technology.stage}:${technology.name}:${settingsKey}`;
        })
        .join('||'),
    [technologies]
  );
  const technologyIndex = useMemo(() => buildTechnologyIndex(technologies), [technologiesKey]);
  const techReady = !technologiesLoading && !technologiesError && technologies.length > 0;
  const graphActionsDisabled = graphUpdating || !techReady;

  const graph = experiment?.graph;
  const [graphNodes, setGraphNodes] = useState<FlatGraphNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [modalState, setModalState] = useState<NodeModalState>(null);
  const [draftNode, setDraftNode] = useState<NodeDraft | null>(null);
  const graphSignatureRef = useRef<string>('');

  useEffect(() => {
    if (!graph) {
      setGraphNodes([]);
      return;
    }
    const nextNodes = graph.nodes.map((node) => {
      const stage = node.stage ?? DEFAULT_STAGE;
      const resolvedTechnology = resolveTechnology(
        technologyIndex,
        stage,
        node.technology,
        node.label
      );
      const technologyName = resolvedTechnology?.name ?? node.technology ?? node.label ?? '';
      const settings = buildSettingsMap(resolvedTechnology?.settings, node.settings);
      return {
        _id: node._id,
        label: technologyName,
        technology: technologyName,
        stage,
        type: node.type ?? DEFAULT_NODE_TYPE,
        settings,
        parentId: node.parentId ?? null,
      };
    });
    const signature = getGraphSignature(nextNodes);
    if (signature === graphSignatureRef.current) return;
    graphSignatureRef.current = signature;
    setGraphNodes(nextNodes);
  }, [graph, technologyIndex]);

  useEffect(() => {
    if (!selectedNodeId) return;
    if (graphNodes.some((node) => node._id === selectedNodeId)) return;
    setSelectedNodeId(null);
  }, [graphNodes, selectedNodeId]);

  const handleDraftStageChange = (stage: ClassificationStage) => {
    if (!draftNode) return;
    const nextTechnology = getDefaultTechnologyForStage(technologyIndex, stage);
    if (!nextTechnology) return;
    setDraftNode({
      stage,
      technologyName: nextTechnology.name,
      settings: buildSettingsMap(nextTechnology.settings, undefined),
    });
  };

  const handleDraftTechnologyChange = (value: string) => {
    if (!draftNode) return;
    const nextTechnology = technologyIndex.byStageName.get(`${draftNode.stage}:${value}`);
    if (!nextTechnology) return;
    setDraftNode({
      stage: draftNode.stage,
      technologyName: nextTechnology.name,
      settings: buildSettingsMap(nextTechnology.settings, undefined),
    });
  };

  const handleDraftSettingChange = (key: string, value: string) => {
    setDraftNode((prev) =>
      prev
        ? {
            ...prev,
            settings: {
              ...prev.settings,
              [key]: value,
            },
          }
        : prev
    );
  };

  const openAddModal = (parentId: string | null) => {
    if (graphActionsDisabled) return;
    const parentNode = parentId ? graphNodes.find((node) => node._id === parentId) : null;
    const stage = parentNode?.stage ?? DEFAULT_STAGE;
    const defaultTechnology = getDefaultTechnologyForStage(technologyIndex, stage);
    if (!defaultTechnology) return;
    setDraftNode({
      stage,
      technologyName: defaultTechnology.name,
      settings: buildSettingsMap(defaultTechnology.settings, undefined),
    });
    setSelectedNodeId(parentId);
    setModalState({ type: 'add', parentId });
  };

  const openEditModal = (nodeId: string) => {
    if (graphActionsDisabled) return;
    const node = graphNodes.find((item) => item._id === nodeId);
    if (!node) return;
    const stage = node.stage ?? DEFAULT_STAGE;
    const resolvedTechnology = resolveTechnology(
      technologyIndex,
      stage,
      node.technology,
      node.label
    );
    const technologyName = resolvedTechnology?.name ?? node.technology ?? node.label ?? '';
    const currentSettings = settingsRecordToList(node.settings);
    setDraftNode({
      stage,
      technologyName,
      settings: buildSettingsMap(resolvedTechnology?.settings, currentSettings),
    });
    setSelectedNodeId(nodeId);
    setModalState({ type: 'edit', nodeId });
  };

  const openDeleteModal = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setModalState({ type: 'delete', nodeId });
  };

  const closeModal = () => {
    setModalState(null);
    setDraftNode(null);
  };

  const toGraphNodeInput = (node: FlatGraphNode) => {
    const stage = node.stage ?? DEFAULT_STAGE;
    const resolvedTechnology = resolveTechnology(
      technologyIndex,
      stage,
      node.technology,
      node.label
    );
    const technologyName = resolvedTechnology?.name ?? node.technology ?? node.label ?? '';
    const settings = settingsMapToInput(resolvedTechnology, node.settings);
    return {
      _id: node._id,
      label: technologyName,
      technology: technologyName,
      stage,
      type: node.type ?? DEFAULT_NODE_TYPE,
      parentId: node.parentId ?? null,
      settings,
    };
  };

  const persistGraphNodes = async (nextNodes: FlatGraphNode[], nextActiveId?: string | null) => {
    if (!experiment) return;
    try {
      const result = await updateGraph({
        variables: {
          input: {
            _id: experiment._id,
            graphNodes: nextNodes.map(toGraphNodeInput),
          },
        },
      });
      const updatedNodes = result.data?.updateExperiment.graph?.nodes;
      if (!updatedNodes) return;
      const normalized = updatedNodes.map((node) => {
        const stage = node.stage ?? DEFAULT_STAGE;
        const resolvedTechnology = resolveTechnology(
          technologyIndex,
          stage,
          node.technology,
          node.label
        );
        const technologyName = resolvedTechnology?.name ?? node.technology ?? node.label ?? '';
        const settings = buildSettingsMap(resolvedTechnology?.settings, node.settings);
        return {
          _id: node._id,
          label: technologyName,
          technology: technologyName,
          stage,
          type: node.type ?? DEFAULT_NODE_TYPE,
          settings,
          parentId: node.parentId ?? null,
        };
      });
      setGraphNodes(normalized);
      if (
        typeof nextActiveId === 'string' &&
        normalized.some((node) => node._id === nextActiveId)
      ) {
        setSelectedNodeId(nextActiveId);
        return;
      }
      setSelectedNodeId(normalized[0]?._id ?? null);
    } catch (_err) {
      // Error state is handled by graphUpdateError.
    }
  };

  const handleCreateNode = async () => {
    if (!draftNode || modalState?.type !== 'add') return;
    const newNode: FlatGraphNode = {
      _id: createObjectId(),
      label: draftNode.technologyName,
      technology: draftNode.technologyName,
      stage: draftNode.stage,
      type: DEFAULT_NODE_TYPE,
      settings: draftNode.settings,
      parentId: modalState.parentId,
    };
    await persistGraphNodes([...graphNodes, newNode], newNode._id);
    closeModal();
  };

  const handleUpdateNode = async () => {
    if (!draftNode || modalState?.type !== 'edit') return;
    const nextNodes = graphNodes.map((node) =>
      node._id === modalState.nodeId
        ? {
            ...node,
            stage: draftNode.stage,
            technology: draftNode.technologyName,
            label: draftNode.technologyName,
            settings: draftNode.settings,
          }
        : node
    );
    await persistGraphNodes(nextNodes, modalState.nodeId);
    closeModal();
  };

  const handleDeleteNode = async () => {
    if (modalState?.type !== 'delete') return;
    const idsToRemove = collectDescendantIds(graphNodes, modalState.nodeId);
    const nextNodes = graphNodes.filter((node) => !idsToRemove.has(node._id));
    const targetNode = graphNodes.find((node) => node._id === modalState.nodeId) ?? null;
    const nextActiveId = targetNode?.parentId ?? null;
    await persistGraphNodes(nextNodes, nextActiveId);
    closeModal();
  };

  const draftTechnologies = draftNode ? (technologyIndex.byStage.get(draftNode.stage) ?? []) : [];
  const draftTechnology = draftNode
    ? (technologyIndex.byStageName.get(`${draftNode.stage}:${draftNode.technologyName}`) ?? null)
    : null;
  const { flowNodes, flowEdges } = buildFlowElements({
    nodes: graphNodes,
    selectedNodeId,
    graphActionsDisabled,
    graphUpdating,
    onAdd: openAddModal,
    onEdit: openEditModal,
    onDelete: openDeleteModal,
  });
  const nodeTypes = useMemo(() => ({ graphNode: GraphNode }), []);
  const hasNodes = graphNodes.length > 0;

  const backHref = experiment?._id
    ? `/app/experiments/${experiment._id}`
    : experimentId
      ? `/app/experiments/${experimentId}`
      : '/app/experiments';

  return (
    <div className="constructor-page">
      <header className="constructor-topbar">
        <Link className="btn ghost" to={backHref}>
          Назад
        </Link>
      </header>
      <div className="constructor-canvas">
        {!experimentId && <p className="error">Не вказано ідентифікатор експерименту.</p>}
        {loading && !experiment && <p className="muted">Завантаження експерименту...</p>}
        {error && <p className="error">Помилка: {error.message}</p>}
        {!loading && !error && !experiment && <p className="error">Експеримент не знайдено.</p>}

        {experiment && (
          <div className="constructor-chart">
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              nodesDraggable={false}
              nodesConnectable={false}
              zoomOnDoubleClick={false}
              className="constructor-flow"
            />
            {!hasNodes && (
              <p className="muted small">Наразі є лише Початок. Додайте перший вузол.</p>
            )}
            {technologiesLoading && <p className="muted small">Завантаження технологій...</p>}
            {technologiesError && (
              <p className="error small">Помилка технологій: {technologiesError.message}</p>
            )}
            {graphUpdateError && (
              <p className="error small">Помилка оновлення графа: {graphUpdateError.message}</p>
            )}
          </div>
        )}
      </div>

      <Modal
        open={modalState?.type === 'add' || modalState?.type === 'edit'}
        title={modalState?.type === 'edit' ? 'Редагувати вузол' : 'Додати вузол'}
        onClose={closeModal}
      >
        {draftNode ? (
          <form
            className="node-modal"
            onSubmit={(event) => {
              event.preventDefault();
              if (modalState?.type === 'edit') {
                void handleUpdateNode();
                return;
              }
              void handleCreateNode();
            }}
          >
            <div className="form-group">
              <label htmlFor="node-stage">Етап класифікації</label>
              <select
                id="node-stage"
                value={draftNode.stage}
                onChange={(event) => {
                  const value = event.target.value;
                  if (!isClassificationStage(value)) return;
                  if (value === draftNode.stage) return;
                  handleDraftStageChange(value);
                }}
                disabled={graphActionsDisabled}
              >
                <option value="" disabled>
                  Оберіть етап
                </option>
                {classificationStages.map((stage) => (
                  <option
                    key={stage}
                    value={stage}
                    disabled={(technologyIndex.byStage.get(stage)?.length ?? 0) === 0}
                  >
                    {stageLabels[stage]}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="node-technology">Технологія</label>
              <select
                id="node-technology"
                value={draftNode.technologyName}
                onChange={(event) => handleDraftTechnologyChange(event.target.value)}
                disabled={graphActionsDisabled || draftTechnologies.length === 0}
              >
                <option value="" disabled>
                  Оберіть технологію
                </option>
                {draftTechnologies.map((technology) => (
                  <option key={technology._id} value={technology.name}>
                    {technology.name}
                  </option>
                ))}
              </select>
            </div>
            {draftTechnology && draftTechnology.settings.length > 0 && (
              <>
                <div className="form-divider">Налаштування</div>
                <div className="node-settings">
                  {draftTechnology.settings.map((setting) => {
                    const settingId = `draft-${setting.key}`;
                    const value = draftNode.settings[setting.key] ?? '';
                    if (setting.type === TechnologySettingType.BOOLEAN) {
                      return (
                        <div className="form-group checkbox" key={setting.key}>
                          <label htmlFor={settingId}>
                            {setting.label}
                            {setting.required ? ' *' : ''}
                          </label>
                          <input
                            id={settingId}
                            type="checkbox"
                            checked={value === 'true'}
                            onChange={(event) =>
                              handleDraftSettingChange(
                                setting.key,
                                event.target.checked ? 'true' : 'false'
                              )
                            }
                            disabled={graphUpdating}
                          />
                        </div>
                      );
                    }
                    if (setting.type === TechnologySettingType.SELECT) {
                      const options = setting.options ?? [];
                      return (
                        <div className="form-group" key={setting.key}>
                          <label htmlFor={settingId}>
                            {setting.label}
                            {setting.required ? ' *' : ''}
                          </label>
                          <select
                            id={settingId}
                            value={value}
                            onChange={(event) =>
                              handleDraftSettingChange(setting.key, event.target.value)
                            }
                            disabled={graphUpdating || options.length === 0}
                            required={Boolean(setting.required)}
                          >
                            <option value="" disabled>
                              Оберіть значення
                            </option>
                            {options.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    }
                    const inputType =
                      setting.type === TechnologySettingType.NUMBER ? 'number' : 'text';
                    return (
                      <div className="form-group" key={setting.key}>
                        <label htmlFor={settingId}>
                          {setting.label}
                          {setting.required ? ' *' : ''}
                        </label>
                        <input
                          id={settingId}
                          type={inputType}
                          value={value}
                          onChange={(event) =>
                            handleDraftSettingChange(setting.key, event.target.value)
                          }
                          placeholder={setting.placeholder ?? undefined}
                          required={Boolean(setting.required)}
                          disabled={graphUpdating}
                        />
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            <div className="graph-panel-actions">
              <button className="btn ghost" type="button" onClick={closeModal}>
                Скасувати
              </button>
              <button
                className="btn primary"
                type="submit"
                disabled={graphUpdating || graphActionsDisabled}
              >
                {modalState?.type === 'edit' ? 'Зберегти' : 'Створити'}
              </button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal open={modalState?.type === 'delete'} title="Видалити вузол" onClose={closeModal}>
        <div className="node-modal">
          <p>Видалити вузол та всі дочірні вузли? Дія незворотна.</p>
          <div className="graph-panel-actions">
            <button className="btn ghost" type="button" onClick={closeModal}>
              Скасувати
            </button>
            <button
              className="btn danger"
              type="button"
              onClick={() => void handleDeleteNode()}
              disabled={graphUpdating}
            >
              Видалити
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

type FlatGraphNode = {
  _id: string;
  label: string;
  stage?: ClassificationStage | null;
  technology?: string | null;
  type: string;
  settings?: Record<string, string>;
  parentId?: string | null;
  isRoot?: boolean;
};

const ROOT_NODE_ID = 'graph-root';
const ROOT_NODE_LABEL = 'Початок';
const DEFAULT_STAGE = ClassificationStage.PREPROCESSING;
const DEFAULT_NODE_TYPE = 'technology';

const classificationStages: ClassificationStage[] = [
  ClassificationStage.PREPROCESSING,
  ClassificationStage.DATA_ENHANCEMENT,
  ClassificationStage.FEATURE_EXTRACTION,
  ClassificationStage.DIMENSIONALITY_REDUCTION,
  ClassificationStage.CLASSIFICATION,
];

const stageLabels: Record<ClassificationStage, string> = {
  [ClassificationStage.PREPROCESSING]: 'Попередня обробка',
  [ClassificationStage.DATA_ENHANCEMENT]: 'Покращення даних',
  [ClassificationStage.FEATURE_EXTRACTION]: 'Видобування ознак',
  [ClassificationStage.DIMENSIONALITY_REDUCTION]: 'Зменшення розмірності',
  [ClassificationStage.CLASSIFICATION]: 'Класифікація',
};

type TechnologyIndex = {
  byStage: Map<ClassificationStage, Technology[]>;
  byStageName: Map<string, Technology>;
};

const buildTechnologyIndex = (technologies: Technology[]): TechnologyIndex => {
  const byStage = new Map<ClassificationStage, Technology[]>();
  const byStageName = new Map<string, Technology>();

  technologies.forEach((technology) => {
    const list = byStage.get(technology.stage) ?? [];
    list.push(technology);
    byStage.set(technology.stage, list);
    byStageName.set(`${technology.stage}:${technology.name}`, technology);
  });

  byStage.forEach((list) => {
    list.sort((left, right) => left.name.localeCompare(right.name));
  });

  return { byStage, byStageName };
};

const getDefaultTechnologyForStage = (
  index: TechnologyIndex,
  stage: ClassificationStage
): Technology | null => {
  const list = index.byStage.get(stage);
  return list && list.length > 0 ? list[0] : null;
};

const resolveTechnology = (
  index: TechnologyIndex,
  stage: ClassificationStage,
  technology?: string | null,
  label?: string | null
): Technology | null => {
  const trimmedTechnology = technology?.trim() ?? '';
  const trimmedLabel = label?.trim() ?? '';
  const candidate = trimmedTechnology || trimmedLabel;
  if (candidate) {
    const match = index.byStageName.get(`${stage}:${candidate}`);
    if (match) return match;
  }
  return getDefaultTechnologyForStage(index, stage);
};

const buildSettingsMap = (
  settingDefinitions: TechnologySetting[] | undefined,
  nodeSettings?: GraphNodeSetting[] | null
): Record<string, string> => {
  const values = new Map<string, string>();
  (nodeSettings ?? []).forEach((setting) => {
    const key = setting.key?.trim();
    if (!key) return;
    values.set(key, String(setting.value ?? '').trim());
  });

  if (!settingDefinitions || settingDefinitions.length === 0) {
    const result: Record<string, string> = {};
    values.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  const result: Record<string, string> = {};
  settingDefinitions.forEach((setting) => {
    const fallback = setting.defaultValue ?? '';
    result[setting.key] = values.get(setting.key) ?? fallback;
  });
  return result;
};

const settingsMapToInput = (
  technology: Technology | null,
  settings: Record<string, string> | undefined
): GraphNodeSettingInput[] | undefined => {
  const values = settings ?? {};
  if (!technology || technology.settings.length === 0) {
    const entries = Object.entries(values);
    if (entries.length === 0) return undefined;
    return entries.map(([key, value]) => ({ key, value }));
  }

  return technology.settings.map((setting) => ({
    key: setting.key,
    value: values[setting.key] ?? setting.defaultValue ?? '',
  }));
};

const settingsRecordToList = (settings: Record<string, string> | undefined): GraphNodeSetting[] => {
  if (!settings) return [];
  return Object.entries(settings).map(([key, value]) => ({
    key,
    value,
  }));
};

const collectDescendantIds = (nodes: FlatGraphNode[], rootId: string) => {
  const childrenByParent = new Map<string, string[]>();
  nodes.forEach((node) => {
    if (!node.parentId) return;
    const list = childrenByParent.get(node.parentId) ?? [];
    list.push(node._id);
    childrenByParent.set(node.parentId, list);
  });

  const ids = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const current = stack.pop();
    if (!current || ids.has(current)) continue;
    ids.add(current);
    const children = childrenByParent.get(current);
    if (children) {
      stack.push(...children);
    }
  }
  return ids;
};

const getStageLabel = (stage?: ClassificationStage | null) =>
  stage && stageLabels[stage] ? stageLabels[stage] : 'Етап не вказано';

const isClassificationStage = (value: string): value is ClassificationStage =>
  classificationStages.some((stage) => stage === value);

const createObjectId = () => {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const FLOW_HORIZONTAL_GAP = 260;
const FLOW_VERTICAL_GAP = 120;

const buildFlowElements = ({
  nodes,
  selectedNodeId,
  graphActionsDisabled,
  graphUpdating,
  onAdd,
  onEdit,
  onDelete,
}: {
  nodes: FlatGraphNode[];
  selectedNodeId: string | null;
  graphActionsDisabled: boolean;
  graphUpdating: boolean;
  onAdd: (parentId: string | null) => void;
  onEdit: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
}) => {
  const nodeMap = new Map<string, FlatGraphNode>();
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

function GraphNode({ data }: NodeProps<GraphFlowNodeData>) {
  if (data.isRoot) {
    const rootClassName = `org-node root${data.isActive ? ' active' : ''}`;
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
            disabled={data.graphActionsDisabled}
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
  const className = `org-node${data.isActive ? ' active' : ''}`;

  return (
    <div className={className}>
      <Handle type="target" position={Position.Left} className="graph-node-handle" />
      <Handle type="source" position={Position.Right} className="graph-node-handle" />
      <button
        type="button"
        className="org-node-body"
        onClick={() => data.onEdit(data._id)}
        aria-label="Редагувати вузол"
      >
        <span className="org-node-title">{title}</span>
        <span className="org-node-meta">{meta}</span>
      </button>
      <div className="org-node-actions">
        <button
          className="btn ghost small icon"
          type="button"
          onClick={() => data.onAdd(data._id)}
          disabled={data.graphActionsDisabled}
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
        <button
          className="btn ghost small icon"
          type="button"
          onClick={() => data.onEdit(data._id)}
          disabled={data.graphActionsDisabled}
          aria-label="Редагувати вузол"
          title="Редагувати вузол"
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
          disabled={data.graphUpdating}
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
}

const getGraphSignature = (nodes: FlatGraphNode[]): string => {
  const normalizeSettings = (settings?: Record<string, string>) => {
    if (!settings) return '';
    return Object.keys(settings)
      .sort()
      .map((key) => `${key}:${settings[key]}`)
      .join(',');
  };

  return nodes
    .map((node) => {
      const stage = node.stage ?? '';
      const parent = node.parentId ?? '';
      const tech = node.technology ?? '';
      const type = node.type ?? '';
      return `${node._id}:${parent}:${stage}:${tech}:${type}:${normalizeSettings(node.settings)}`;
    })
    .join('|');
};

export default ExperimentGraphConstructor;
