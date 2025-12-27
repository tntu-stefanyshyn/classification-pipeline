import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ReactFlow from 'reactflow';
import { Modal } from '../../ui/Modal/Modal';
import { GraphNode } from './components/GraphNode/GraphNode';
import { classificationStages, stageLabels } from './constants/stages';
import { DEFAULT_NODE_TYPE, DEFAULT_STAGE } from './constants/graph';
import {
  ClassificationStage,
  ComputationMode,
  type GraphNode as GraphNodeData,
  TechnologySettingType,
  useGenerateExperimentGraphMutation,
  useExperimentQuery,
  useTechnologiesQuery,
  useUpdateExperimentMutation,
} from './graphql';
import { buildFlowElements } from './utils/flow';
import { collectDescendantIds, getGraphSignature } from './utils/graph';
import { buildStageSelectionsFromNodes } from './utils/buildStageSelectionsFromNodes';
import { normalizeGraphNodes } from './utils/normalizeGraphNodes';
import { buildSettingsMap, settingsMapToInput, settingsRecordToList } from './utils/settings';
import { isClassificationStage } from './utils/stage';
import {
  buildTechnologyIndex,
  getDefaultTechnologyForStage,
  resolveTechnology,
} from './utils/technology';
import { createObjectId } from './utils/createObjectId';
import type {
  ExperimentGraphConstructorProps,
  FlatGraphNode,
  NodeDraft,
  NodeModalState,
  StageSelection,
} from './ExperimentGraphConstructor.types';

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
  const [generateGraph, { loading: graphGenerating, error: graphGenerateError }] =
    useGenerateExperimentGraphMutation();

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
  const isGraphBusy = graphUpdating || graphGenerating;
  const graphActionsDisabled = isGraphBusy || !techReady;

  const graph = experiment?.graph;
  const [graphComputationMode, setGraphComputationMode] = useState<ComputationMode>(
    ComputationMode.both
  );
  const [graphNodes, setGraphNodes] = useState<FlatGraphNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [modalState, setModalState] = useState<NodeModalState>(null);
  const [draftNode, setDraftNode] = useState<NodeDraft | null>(null);
  const [autoSelections, setAutoSelections] = useState<StageSelection>({});
  const [autoModalOpen, setAutoModalOpen] = useState(false);
  const graphSignatureRef = useRef<string>('');

  useEffect(() => {
    if (!graph) {
      setGraphNodes([]);
      graphSignatureRef.current = '';
      return;
    }
    const nextNodes = normalizeGraphNodes(graph.nodes ?? [], technologyIndex);
    const signature = getGraphSignature(nextNodes);
    if (signature === graphSignatureRef.current) return;
    graphSignatureRef.current = signature;
    setGraphNodes(nextNodes);
  }, [graph, technologyIndex]);

  useEffect(() => {
    if (!graph?.computationMode) {
      setGraphComputationMode(ComputationMode.both);
      return;
    }
    setGraphComputationMode(graph.computationMode);
  }, [graph?.computationMode]);

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

  const applyGraphUpdate = (nodes?: GraphNodeData[], nextActiveId?: string | null) => {
    if (!nodes) return;
    const normalized = normalizeGraphNodes(nodes, technologyIndex);
    const signature = getGraphSignature(normalized);
    graphSignatureRef.current = signature;
    setGraphNodes(normalized);
    if (typeof nextActiveId === 'string' && normalized.some((node) => node._id === nextActiveId)) {
      setSelectedNodeId(nextActiveId);
      return;
    }
    setSelectedNodeId(normalized[0]?._id ?? null);
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
      applyGraphUpdate(updatedNodes, nextActiveId);
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

  const openAutoModal = () => {
    if (!techReady) return;
    setAutoSelections(buildStageSelectionsFromNodes(graphNodes, technologyIndex));
    setAutoModalOpen(true);
  };

  const closeAutoModal = () => {
    setAutoModalOpen(false);
  };

  const toggleAutoSelection = (stage: ClassificationStage, technologyId: string) => {
    setAutoSelections((prev) => {
      const next = new Set(prev[stage] ?? []);
      if (next.has(technologyId)) {
        next.delete(technologyId);
      } else {
        next.add(technologyId);
      }
      return {
        ...prev,
        [stage]: Array.from(next),
      };
    });
  };

  const handleGenerateGraph = async () => {
    if (!experiment) return;
    const stages = classificationStages
      .map((stage) => ({
        stage,
        technologyIds: autoSelections[stage] ?? [],
      }))
      .filter((item) => item.technologyIds.length > 0);

    if (!stages.some((item) => item.stage === ClassificationStage.CLASSIFICATION)) {
      return;
    }

    try {
      const result = await generateGraph({
        variables: {
          input: {
            _id: experiment._id,
            stages,
          },
        },
      });
      applyGraphUpdate(result.data?.generateExperimentGraph.graph?.nodes);
      closeAutoModal();
    } catch (_error) {
      // Error state is handled by graphGenerateError.
    }
  };

  const draftTechnologies = draftNode ? (technologyIndex.byStage.get(draftNode.stage) ?? []) : [];
  const draftTechnology = draftNode
    ? (technologyIndex.byStageName.get(`${draftNode.stage}:${draftNode.technologyName}`) ?? null)
    : null;
  const { flowNodes, flowEdges } = buildFlowElements({
    nodes: graphNodes,
    selectedNodeId,
    graphActionsDisabled,
    graphUpdating: isGraphBusy,
    onAdd: openAddModal,
    onEdit: openEditModal,
    onDelete: openDeleteModal,
  });
  const nodeTypes = useMemo(() => ({ graphNode: GraphNode }), []);
  const hasNodes = graphNodes.length > 0;
  const classificationSelection = autoSelections[ClassificationStage.CLASSIFICATION] ?? [];
  const canGenerateGraph =
    classificationSelection.length > 0 && !graphActionsDisabled && Boolean(experiment);

  const handleComputationModeChange = async (value: ComputationMode) => {
    if (!experiment) return;
    setGraphComputationMode(value);
    try {
      await updateGraph({
        variables: {
          input: {
            _id: experiment._id,
            graphComputationMode: value,
          },
        },
      });
    } catch (_error) {
      // Error state is handled by graphUpdateError.
    }
  };

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
        <button
          className="btn primary"
          type="button"
          onClick={openAutoModal}
          disabled={!techReady || graphActionsDisabled}
        >
          Автозаповнення
        </button>
      </header>
      <div className="constructor-canvas">
        {!experimentId && <p className="error">Не вказано ідентифікатор експерименту.</p>}
        {loading && !experiment && <p className="muted">Завантаження експерименту...</p>}
        {error && <p className="error">Помилка: {error.message}</p>}
        {!loading && !error && !experiment && <p className="error">Експеримент не знайдено.</p>}

        {experiment && (
          <div className="constructor-chart">
            <div className="item-list">
              <div className="form-group">
                <label htmlFor="graph-computation-mode">Режим обчислень</label>
                <select
                  id="graph-computation-mode"
                  value={graphComputationMode}
                  onChange={(event) =>
                    handleComputationModeChange(event.target.value as ComputationMode)
                  }
                  disabled={graphActionsDisabled}
                >
                  <option value={ComputationMode.both}>Локальні + хмарні</option>
                  <option value={ComputationMode.local}>Тільки локальні</option>
                  <option value={ComputationMode.cloud}>Тільки хмарні</option>
                </select>
              </div>
            </div>
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
            {graphGenerateError && (
              <p className="error small">Помилка автозаповнення: {graphGenerateError.message}</p>
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
                            disabled={isGraphBusy}
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
                            disabled={isGraphBusy || options.length === 0}
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
                          disabled={isGraphBusy}
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
                disabled={isGraphBusy || graphActionsDisabled}
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
              disabled={isGraphBusy}
            >
              Видалити
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={autoModalOpen} title="Автозаповнення графа" onClose={closeAutoModal}>
        <div className="node-modal">
          <p className="muted small">
            Оберіть технології для потрібних етапів. Усі етапи, окрім класифікації, опціональні,
            тому для них буде створено гілку без етапу. Порожні етапи буде пропущено. Після
            автозаповнення поточний граф буде замінено.
          </p>
          {classificationStages.map((stage) => {
            const stageTechnologies = technologyIndex.byStage.get(stage) ?? [];
            const selectedIds = autoSelections[stage] ?? [];
            return (
              <div key={stage}>
                <div className="form-divider">{stageLabels[stage]}</div>
                <p className="muted small">
                  {stage === ClassificationStage.CLASSIFICATION
                    ? 'Фінальний етап — обовʼязково виберіть хоча б одну технологію.'
                    : 'Етап можна пропустити, якщо не потрібен.'}
                </p>
                {stageTechnologies.length === 0 ? (
                  <p className="muted small">Немає доступних технологій для цього етапу.</p>
                ) : (
                  stageTechnologies.map((technology) => {
                    const inputId = `auto-${stage}-${technology._id}`;
                    return (
                      <div className="form-group checkbox" key={technology._id}>
                        <label htmlFor={inputId}>{technology.name}</label>
                        <input
                          id={inputId}
                          type="checkbox"
                          checked={selectedIds.includes(technology._id)}
                          onChange={() => toggleAutoSelection(stage, technology._id)}
                          disabled={graphGenerating}
                        />
                      </div>
                    );
                  })
                )}
              </div>
            );
          })}
          {graphGenerateError && (
            <p className="error">Помилка автозаповнення: {graphGenerateError.message}</p>
          )}
          {!classificationSelection.length && (
            <p className="error">
              Оберіть хоча б одну технологію етапу класифікації (інші етапи опціональні).
            </p>
          )}
          <div className="graph-panel-actions">
            <button className="btn ghost" type="button" onClick={closeAutoModal}>
              Скасувати
            </button>
            <button
              className="btn primary"
              type="button"
              onClick={() => void handleGenerateGraph()}
              disabled={!canGenerateGraph}
            >
              {graphGenerating ? 'Автозаповнення...' : 'Згенерувати'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
export default ExperimentGraphConstructor;
