import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import { Link, useLocation } from 'react-router-dom';
import ReactFlow from 'reactflow';
import { Modal } from '../../ui/Modal';
import { Alert } from '../../ui/Alert';
import { CheckboxField } from '../../inputs/CheckboxField';
import { InputControl } from '../../inputs/InputControl';
import { GraphSettingsModal } from '../GraphSettingsModal';
import { GraphNode } from './components/GraphNode';
import { classificationStages, stageLabels } from './constants/stages';
import { DEFAULT_NODE_TYPE, DEFAULT_STAGE } from './constants/graph';
import {
  ClassificationStage,
  ExperimentStatus,
  type GraphNode as GraphNodeData,
  TechnologySettingType,
  type GraphStructureSettingsInput,
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

const ExperimentGraphConstructor: FC<ExperimentGraphConstructorProps> = ({ experimentId }) => {
  const location = useLocation();
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
  const isExperimentLocked =
    experiment?.status === ExperimentStatus.computing ||
    experiment?.status === ExperimentStatus.optimization ||
    experiment?.status === ExperimentStatus.completed;
  const graphActionsDisabled = isGraphBusy || !techReady || isExperimentLocked;

  const graph = experiment?.graph;
  const graphSettings = graph?.settings ?? null;
  const [graphNodes, setGraphNodes] = useState<FlatGraphNode[]>([]);
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [modalState, setModalState] = useState<NodeModalState>(null);
  const [draftNode, setDraftNode] = useState<NodeDraft | null>(null);
  const [autoSelections, setAutoSelections] = useState<StageSelection>({});
  const [autoModalOpen, setAutoModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const graphSignatureRef = useRef<string>('');
  const openedSettingsRef = useRef(false);

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
    if (!selectedNodeId) return;
    if (graphNodes.some((node) => node._id === selectedNodeId)) return;
    setSelectedNodeId(null);
  }, [graphNodes, selectedNodeId]);

  useEffect(() => {
    setCollapsedNodeIds((prev) => {
      if (prev.size === 0) return prev;
      const existingNodeIds = new Set(graphNodes.map((node) => node._id));
      const parentNodeIds = new Set(
        graphNodes
          .map((node) => node.parentId)
          .filter((parentId): parentId is string => Boolean(parentId))
      );
      const next = new Set<string>();
      prev.forEach((nodeId) => {
        if (existingNodeIds.has(nodeId) && parentNodeIds.has(nodeId)) next.add(nodeId);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [graphNodes]);

  const getAllowedStages = (parentStage?: ClassificationStage | null) => {
    if (!parentStage) return classificationStages;
    const stageIndex = classificationStages.indexOf(parentStage);
    if (stageIndex < 0) return classificationStages;
    return classificationStages.slice(stageIndex + 1);
  };

  const getParentStage = (nodeId?: string | null) => {
    if (!nodeId) return null;
    const node = graphNodes.find((item) => item._id === nodeId);
    if (!node?.parentId) return null;
    return graphNodes.find((item) => item._id === node.parentId)?.stage ?? null;
  };

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
    const allowedStages = getAllowedStages(parentNode?.stage ?? null);
    const stage =
      allowedStages.find((candidate) =>
        Boolean(getDefaultTechnologyForStage(technologyIndex, candidate))
      ) ?? null;
    if (!stage) return;
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

  const handleToggleCollapse = (nodeId: string) => {
    if (graphActionsDisabled) return;
    const isCollapsing = !collapsedNodeIds.has(nodeId);
    if (isCollapsing && selectedNodeId && selectedNodeId !== nodeId) {
      const byId = new Map(graphNodes.map((node) => [node._id, node] as const));
      let currentParentId = byId.get(selectedNodeId)?.parentId ?? null;
      while (currentParentId) {
        if (currentParentId === nodeId) {
          setSelectedNodeId(nodeId);
          break;
        }
        currentParentId = byId.get(currentParentId)?.parentId ?? null;
      }
    }
    setCollapsedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const closeModal = () => {
    setModalState(null);
    setDraftNode(null);
  };

  const openSettingsModal = () => {
    if (isExperimentLocked) return;
    setSettingsModalOpen(true);
  };

  const closeSettingsModal = () => {
    setSettingsModalOpen(false);
  };

  useEffect(() => {
    const state = location.state as { openSettings?: boolean } | null;
    if (!state?.openSettings || openedSettingsRef.current) return;
    if (!experiment || isExperimentLocked) {
      openedSettingsRef.current = true;
      return;
    }
    openSettingsModal();
    openedSettingsRef.current = true;
  }, [experiment, isExperimentLocked, location.state]);

  const openResetModal = () => {
    setResetModalOpen(true);
  };

  const closeResetModal = () => {
    setResetModalOpen(false);
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

  const handleSaveSettings = async (settings: GraphStructureSettingsInput) => {
    if (!experiment) return;
    try {
      await updateGraph({
        variables: {
          input: {
            _id: experiment._id,
            graphSettings: settings,
          },
        },
      });
      closeSettingsModal();
    } catch (_err) {
      // Error state is handled by graphUpdateError.
    }
  };

  const handleResetGraph = async () => {
    if (!experiment) return;
    await persistGraphNodes([]);
    closeResetModal();
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
    if (graphActionsDisabled) return;
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

  const addParentStage = modalState?.type === 'add' ? getParentStage(modalState.parentId) : null;
  const editParentStage = modalState?.type === 'edit' ? getParentStage(modalState.nodeId) : null;
  const selectableStages =
    modalState?.type === 'add'
      ? getAllowedStages(addParentStage)
      : modalState?.type === 'edit'
        ? getAllowedStages(editParentStage)
        : classificationStages;

  const draftTechnologies = draftNode ? (technologyIndex.byStage.get(draftNode.stage) ?? []) : [];
  const draftTechnology = draftNode
    ? (technologyIndex.byStageName.get(`${draftNode.stage}:${draftNode.technologyName}`) ?? null)
    : null;
  const { flowNodes, flowEdges } = buildFlowElements({
    nodes: graphNodes,
    selectedNodeId,
    collapsedNodeIds,
    graphActionsDisabled,
    graphUpdating: isGraphBusy,
    onAdd: openAddModal,
    onEdit: openEditModal,
    onDelete: openDeleteModal,
    onToggleCollapse: handleToggleCollapse,
  });
  const nodeTypes = useMemo(() => ({ graphNode: GraphNode }), []);
  const classificationSelection = autoSelections[ClassificationStage.CLASSIFICATION] ?? [];
  const canGenerateGraph =
    classificationSelection.length > 0 && !graphActionsDisabled && Boolean(experiment);

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
        <button
          className="btn ghost"
          type="button"
          onClick={openSettingsModal}
          disabled={!experiment || isExperimentLocked}
        >
          Змінити налаштування
        </button>
        <button
          className="btn danger"
          type="button"
          onClick={openResetModal}
          disabled={graphActionsDisabled || graphNodes.length === 0}
        >
          Скинути граф
        </button>
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
              proOptions={{ hideAttribution: true }}
            />
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
                disabled={graphActionsDisabled || selectableStages.length === 0}
              >
                <option value="" disabled>
                  Оберіть етап
                </option>
                {selectableStages.map((stage) => (
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
                        <CheckboxField
                          key={setting.key}
                          id={settingId}
                          label={`${setting.label}${setting.required ? ' *' : ''}`}
                          checked={value === 'true'}
                          onChange={(event) =>
                            handleDraftSettingChange(
                              setting.key,
                              event.target.checked ? 'true' : 'false'
                            )
                          }
                          disabled={isGraphBusy || isExperimentLocked}
                        />
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
                      <InputControl
                        key={setting.key}
                        id={settingId}
                        label={`${setting.label}${setting.required ? ' *' : ''}`}
                        type={inputType}
                        value={value}
                        onChange={(event) =>
                          handleDraftSettingChange(setting.key, event.target.value)
                        }
                        placeholder={setting.placeholder ?? undefined}
                        required={Boolean(setting.required)}
                        disabled={isGraphBusy || isExperimentLocked}
                      />
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
              disabled={isGraphBusy || isExperimentLocked}
            >
              Видалити
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={autoModalOpen} title="Автозаповнення графа" onClose={closeAutoModal}>
        <div className="node-modal">
          <Alert variant="info">
            Оберіть хоча б одну технологію етапу класифікації (інші етапи опціональні).
          </Alert>
          {classificationStages.map((stage) => {
            const stageTechnologies = technologyIndex.byStage.get(stage) ?? [];
            const selectedIds = autoSelections[stage] ?? [];
            return (
              <div key={stage}>
                <div className="form-divider auto-stage-divider">{stageLabels[stage]}</div>
                {stageTechnologies.length === 0 ? (
                  <p className="muted small">Немає доступних технологій для цього етапу.</p>
                ) : (
                  stageTechnologies.map((technology) => {
                    const inputId = `auto-${stage}-${technology._id}`;
                    return (
                      <CheckboxField
                        key={technology._id}
                        id={inputId}
                        label={technology.name}
                        checked={selectedIds.includes(technology._id)}
                        onChange={() => toggleAutoSelection(stage, technology._id)}
                        disabled={graphGenerating || isExperimentLocked}
                      />
                    );
                  })
                )}
              </div>
            );
          })}
          {graphGenerateError && (
            <p className="error">Помилка автозаповнення: {graphGenerateError.message}</p>
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

      <GraphSettingsModal
        open={settingsModalOpen}
        settings={graphSettings}
        onClose={closeSettingsModal}
        onSave={handleSaveSettings}
        isBusy={isGraphBusy}
        isLocked={isExperimentLocked}
        errorMessage={graphUpdateError?.message ?? null}
      />

      <Modal open={resetModalOpen} title="Скинути граф" onClose={closeResetModal}>
        <div className="node-modal">
          <p>Скинути граф до початкового стану? Це видалить усі вузли.</p>
          <div className="graph-panel-actions">
            <button className="btn ghost" type="button" onClick={closeResetModal}>
              Скасувати
            </button>
            <button
              className="btn danger"
              type="button"
              onClick={() => void handleResetGraph()}
              disabled={isGraphBusy || isExperimentLocked}
            >
              Скинути
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
export default ExperimentGraphConstructor;
