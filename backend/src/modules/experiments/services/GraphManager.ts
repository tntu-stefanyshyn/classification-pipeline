import { Types } from 'mongoose';
import { GraphStructure } from '../classes/GraphStructure';
import { GraphNode } from '../classes/GraphNode';
import { GraphNodeInput } from '../classes/GraphNodeInput';
import { GraphStageSelectionInput } from '../classes/GraphStageSelectionInput';
import { GraphNodeSetting } from '../classes/GraphNodeSetting';
import { CLASSIFICATION_STAGE_VALUES, ClassificationStage } from '../classes/ClassificationStage';
import { GraphStructureModel } from '../models/GraphStructureModel';
import { Technology } from '../../technologies/classes/Technology';
import { TechnologyManager } from '../../technologies/services/TechnologyManager';
import { ComputationMode } from '../classes/ComputationMode';

type TechnologyIndex = {
  byStage: Map<ClassificationStage, Technology[]>;
  byStageName: Map<string, Technology>;
  byName: Map<string, Technology>;
};

const DEFAULT_NODE_TYPE = 'technology';

export class GraphManager {
  private readonly technologyManager = new TechnologyManager();

  async getById(_id: Types.ObjectId | string): Promise<GraphStructure> {
    const graph = await GraphStructureModel.findOne({ _id });
    if (!graph) throw new Error('Граф не знайдено');
    return graph;
  }

  async getByExperimentId(experimentId: Types.ObjectId | string): Promise<GraphStructure> {
    const graph = await GraphStructureModel.findOne({ experimentId });
    if (!graph) throw new Error('Граф не знайдено');
    return graph;
  }

  async createDefaultGraph(experimentId: Types.ObjectId): Promise<void> {
    await GraphStructureModel.create({ experimentId });
  }

  async updateGraph(
    experimentId: Types.ObjectId | string,
    nodes: GraphNodeInput[]
  ): Promise<GraphStructure> {
    await GraphStructureModel.updateOne({ experimentId }, { $set: { nodes } });

    return this.getByExperimentId(experimentId);
  }

  async updateComputationMode(
    experimentId: Types.ObjectId | string,
    computationMode: ComputationMode
  ): Promise<GraphStructure> {
    await GraphStructureModel.updateOne(
      { experimentId },
      { $set: { computationMode } },
      { upsert: true }
    );

    return this.getByExperimentId(experimentId);
  }

  async generateGraphFromSelections(
    experimentId: Types.ObjectId | string,
    selections: GraphStageSelectionInput[]
  ): Promise<GraphStructure> {
    const selectionMap = new Map<ClassificationStage, Set<string>>();
    selections.forEach((selection) => {
      const ids = Array.isArray(selection.technologyIds) ? selection.technologyIds : [];
      const normalized = ids.map((id) => id.trim()).filter(Boolean);
      if (normalized.length === 0) return;
      const set = selectionMap.get(selection.stage) ?? new Set<string>();
      normalized.forEach((id) => set.add(id));
      selectionMap.set(selection.stage, set);
    });

    const classificationIds = selectionMap.get(ClassificationStage.CLASSIFICATION);
    if (!classificationIds || classificationIds.size === 0) {
      throw new Error('Фінальний етап має містити щонайменше одну технологію класифікації.');
    }

    const technologies = await this.technologyManager.list();
    const technologyById = new Map<string, Technology>();
    technologies.forEach((technology) => {
      technologyById.set(String(technology._id), technology);
    });

    const stageTechnologiesByStage = new Map<ClassificationStage, Technology[]>();
    CLASSIFICATION_STAGE_VALUES.forEach((stage) => {
      const ids = Array.from(selectionMap.get(stage) ?? []);
      if (ids.length === 0) {
        stageTechnologiesByStage.set(stage, []);
        return;
      }
      const stageTechnologies: Technology[] = [];
      ids.forEach((id) => {
        if (!Types.ObjectId.isValid(id)) {
          throw new Error(`Некоректний ідентифікатор технології: ${id}`);
        }
        const technology = technologyById.get(id);
        if (!technology) {
          throw new Error(`Технологію не знайдено: ${id}`);
        }
        if (technology.stage !== stage) {
          throw new Error(`Технологія "${technology.name}" не відповідає етапу ${stage}.`);
        }
        stageTechnologies.push(technology);
      });
      stageTechnologiesByStage.set(stage, stageTechnologies);
    });

    const nodes: GraphNodeInput[] = [];
    let parentIds: Array<string | null> = [null];

    CLASSIFICATION_STAGE_VALUES.forEach((stage) => {
      const stageTechnologies = stageTechnologiesByStage.get(stage) ?? [];
      if (stageTechnologies.length === 0) {
        if (stage === ClassificationStage.CLASSIFICATION) {
          throw new Error('Фінальний етап має містити щонайменше одну технологію класифікації.');
        }
        return;
      }

      const nextParentIds: Array<string | null> = [];
      const createNode = (parentId: string | null, technology: Technology) => {
        const nodeId = new Types.ObjectId().toHexString();
        const settings = this.buildSettingsForTechnology(technology, undefined);
        nodes.push({
          _id: nodeId,
          label: technology.name,
          stage,
          technology: technology.name,
          type: DEFAULT_NODE_TYPE,
          parentId: parentId ?? undefined,
          settings,
        });
        nextParentIds.push(nodeId);
      };

      parentIds.forEach((parentId) => {
        stageTechnologies.forEach((technology) => createNode(parentId, technology));
      });

      if (stage !== ClassificationStage.CLASSIFICATION) {
        nextParentIds.push(...parentIds);
      }

      parentIds = nextParentIds;
    });

    return this.updateGraph(experimentId, nodes);
  }

  private async normalizeGraphNodes(nodes: GraphNodeInput[]): Promise<GraphNode[]> {
    const technologies = await this.technologyManager.list();
    const { byStageName, byName } = this.buildTechnologyIndex(technologies);

    const idMap = new Map<string, Types.ObjectId>();
    const rawIds = new Set<string>();
    nodes.forEach((node) => {
      const rawId = node._id.trim();
      if (!rawId) throw new Error('Graph node _id is required');
      if (rawIds.has(rawId)) {
        throw new Error(`Graph node _id must be unique: ${rawId}`);
      }
      rawIds.add(rawId);
      const objectId = Types.ObjectId.isValid(rawId)
        ? new Types.ObjectId(rawId)
        : new Types.ObjectId();
      idMap.set(rawId, objectId);
    });

    const normalized = nodes.map((node) => {
      const rawId = node._id.trim();
      const nodeId = idMap.get(rawId);
      if (!nodeId) throw new Error('Graph node _id is required');

      const label = node.label?.trim() ?? '';
      const rawTechnology = typeof node.technology === 'string' ? node.technology.trim() : '';
      const candidateTechnology = rawTechnology || label;
      if (!candidateTechnology) {
        throw new Error('Graph node technology is required');
      }

      let stage = node.stage ?? null;
      let technology: Technology | null = null;
      if (stage) {
        if (!CLASSIFICATION_STAGE_VALUES.includes(stage)) {
          throw new Error(`Unsupported classification stage for node ${nodeId.toHexString()}`);
        }
        technology = byStageName.get(`${stage}:${candidateTechnology}`) ?? null;
      } else {
        technology = byName.get(candidateTechnology) ?? null;
        if (technology) stage = technology.stage;
      }

      if (!stage) {
        throw new Error('Graph node stage is required');
      }
      if (!technology) {
        throw new Error(`Unsupported technology for stage ${stage}`);
      }

      const parentIdRaw = typeof node.parentId === 'string' ? node.parentId.trim() : '';
      const parentId = parentIdRaw ? idMap.get(parentIdRaw) : undefined;
      if (parentIdRaw && !parentId) {
        throw new Error(`Parent node not found for ${nodeId.toHexString()}`);
      }
      if (parentId && parentId.toHexString() === nodeId.toHexString()) {
        throw new Error(`Graph node cannot reference itself: ${nodeId.toHexString()}`);
      }

      const rawType = typeof node.type === 'string' ? node.type.trim() : '';
      const type = rawType || DEFAULT_NODE_TYPE;
      const settings = this.buildSettingsForTechnology(technology, node.settings);

      return {
        _id: nodeId,
        label: technology.name,
        stage,
        technology: technology.name,
        settings,
        type,
        parentId,
      };
    });

    return normalized;
  }

  private buildTechnologyIndex(technologies: Technology[]): TechnologyIndex {
    const byStage = new Map<ClassificationStage, Technology[]>();
    const byStageName = new Map<string, Technology>();
    const byName = new Map<string, Technology>();

    technologies.forEach((technology) => {
      const list = byStage.get(technology.stage) ?? [];
      list.push(technology);
      byStage.set(technology.stage, list);
      byStageName.set(`${technology.stage}:${technology.name}`, technology);
      if (!byName.has(technology.name)) {
        byName.set(technology.name, technology);
      }
    });

    return { byStage, byStageName, byName };
  }

  private buildSettingsForTechnology(
    technology: Technology,
    inputSettings?: GraphNodeSetting[] | null
  ): GraphNodeSetting[] {
    const values = new Map<string, string>();
    (inputSettings ?? []).forEach((setting) => {
      const key = setting.key.trim();
      if (!key) return;
      values.set(key, String(setting.value ?? '').trim());
    });

    return technology.settings.map((setting) => {
      const fallback = setting.defaultValue ?? '';
      const value = values.get(setting.key) ?? fallback;
      if (setting.required && !value) {
        throw new Error(`Setting "${setting.key}" is required for ${technology.name}`);
      }
      return {
        key: setting.key,
        value,
      };
    });
  }

  private async ensureGraphNodeIntegrity(graph: GraphStructure): Promise<GraphStructure> {
    if (!graph.nodes || graph.nodes.length === 0) return graph;
    const requiresNormalization = graph.nodes.some((node) => {
      const nodeId = String(node._id);
      if (!Types.ObjectId.isValid(nodeId)) return true;
      if (!node.stage || !node.technology || !node.type) return true;
      if (node.parentId && !Types.ObjectId.isValid(String(node.parentId))) return true;
      return false;
    });
    if (!requiresNormalization) return graph;

    const technologies = await this.technologyManager.list();
    const { byName } = this.buildTechnologyIndex(technologies);

    const inputNodes: GraphNodeInput[] = graph.nodes.map((node) => {
      const label = node.label ?? '';
      const rawTechnology = node.technology ?? label;
      const technologyName = rawTechnology?.trim() ?? '';
      const resolvedStage =
        node.stage ?? byName.get(technologyName)?.stage ?? ClassificationStage.PREPROCESSING;
      return {
        _id: String(node._id),
        label,
        stage: resolvedStage,
        technology: technologyName,
        type: node.type ?? DEFAULT_NODE_TYPE,
        parentId: node.parentId ? String(node.parentId) : undefined,
        settings: node.settings ?? undefined,
      };
    });

    const normalizedNodes = await this.normalizeGraphNodes(inputNodes);
    const resolvedExperimentId =
      typeof graph.experimentId === 'string'
        ? new Types.ObjectId(graph.experimentId)
        : graph.experimentId;
    const updatedGraph: GraphStructure = {
      ...graph,
      experimentId: resolvedExperimentId,
      nodes: normalizedNodes,
      createdAt: graph.createdAt ?? new Date(),
    };

    await GraphStructureModel.updateOne(
      { experimentId: resolvedExperimentId },
      { $set: { nodes: normalizedNodes, createdAt: updatedGraph.createdAt } },
      { upsert: true }
    );

    return updatedGraph;
  }
}
