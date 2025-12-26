import { Types } from 'mongoose';
import { GraphStructure } from '../classes/GraphStructure';
import { GraphNode } from '../classes/GraphNode';
import { GraphNodeInput } from '../classes/GraphNodeInput';
import { GraphNodeSetting } from '../classes/GraphNodeSetting';
import { CLASSIFICATION_STAGE_VALUES, ClassificationStage } from '../classes/ClassificationStage';
import { GraphStructureModel } from '../models/GraphStructureModel';
import { Technology } from '../../technologies/classes/Technology';
import { TechnologyManager } from '../../technologies/services/TechnologyManager';

type TechnologyIndex = {
  byStage: Map<ClassificationStage, Technology[]>;
  byStageName: Map<string, Technology>;
  byName: Map<string, Technology>;
};

const DEFAULT_NODE_TYPE = 'technology';

export class GraphManager {
  private readonly technologyManager = new TechnologyManager();

  async getByExperimentId(experimentId: string): Promise<GraphStructure | null> {
    const graph = await GraphStructureModel.findOne({ experimentId }).lean<GraphStructure>().exec();
    if (graph) {
      return this.ensureGraphNodeIntegrity(graph);
    }
    return null;
  }

  async createDefaultGraph(experimentId: Types.ObjectId | string): Promise<GraphStructure> {
    const graph = await this.buildDefaultGraph(experimentId);
    const created = await GraphStructureModel.create(graph);
    return created.toObject();
  }

  async updateGraph(experimentId: string, nodes: GraphNodeInput[]): Promise<GraphStructure> {
    const currentGraph = await GraphStructureModel.findOne({ experimentId })
      .lean<GraphStructure>()
      .exec();
    const updatedGraph = await this.buildGraphFromInput(
      experimentId,
      currentGraph ?? undefined,
      nodes
    );
    await GraphStructureModel.updateOne(
      { experimentId },
      { $set: updatedGraph, $setOnInsert: { experimentId: updatedGraph.experimentId } },
      { upsert: true }
    ).exec();
    if (currentGraph?._id) {
      return { ...updatedGraph, _id: currentGraph._id };
    }
    const savedGraph = await GraphStructureModel.findOne({ experimentId })
      .lean<GraphStructure>()
      .exec();
    return savedGraph ?? updatedGraph;
  }

  private buildGraph(experimentId: Types.ObjectId | string, nodes: GraphNode[]): GraphStructure {
    const resolvedExperimentId =
      typeof experimentId === 'string' ? new Types.ObjectId(experimentId) : experimentId;
    return {
      experimentId: resolvedExperimentId,
      nodes,
      createdAt: new Date(),
    };
  }

  private async buildDefaultGraph(experimentId: Types.ObjectId | string): Promise<GraphStructure> {
    const technologies = await this.technologyManager.list();
    const { byStage } = this.buildTechnologyIndex(technologies);

    let parentId: Types.ObjectId | undefined;
    const nodes: GraphNode[] = CLASSIFICATION_STAGE_VALUES.map((stage) => {
      const techForStage = byStage.get(stage);
      if (!techForStage || techForStage.length === 0) {
        throw new Error(`No technologies configured for stage ${stage}`);
      }
      const technology = techForStage[0];
      const nodeId = new Types.ObjectId();
      const node: GraphNode = {
        _id: nodeId,
        label: technology.name,
        technology: technology.name,
        stage,
        settings: this.buildSettingsForTechnology(technology, undefined),
        type: DEFAULT_NODE_TYPE,
        parentId,
      };
      parentId = nodeId;
      return node;
    });

    return this.buildGraph(experimentId, nodes);
  }

  private async buildGraphFromInput(
    experimentId: Types.ObjectId | string,
    currentGraph: GraphStructure | undefined,
    nodes: GraphNodeInput[]
  ): Promise<GraphStructure> {
    const normalizedNodes = await this.normalizeGraphNodes(nodes);
    return {
      experimentId:
        typeof experimentId === 'string' ? new Types.ObjectId(experimentId) : experimentId,
      nodes: normalizedNodes,
      createdAt: currentGraph?.createdAt ?? new Date(),
    };
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
        stage = technology?.stage ?? null;
      }

      if (!stage) {
        throw new Error('Graph node stage is required');
      }
      if (!technology) {
        throw new Error(`Unsupported technology for stage ${stage}`);
      }

      const rawType = typeof node.type === 'string' ? node.type.trim() : '';
      const type = rawType || DEFAULT_NODE_TYPE;

      const parentIdRaw = typeof node.parentId === 'string' ? node.parentId.trim() : '';
      const parentId = parentIdRaw ? idMap.get(parentIdRaw) : undefined;
      if (parentIdRaw && !parentId) {
        throw new Error(`Parent node not found for ${nodeId.toHexString()}`);
      }
      if (parentId && parentId.toHexString() === nodeId.toHexString()) {
        throw new Error(`Graph node cannot reference itself: ${nodeId.toHexString()}`);
      }

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
    ).exec();

    return updatedGraph;
  }
}
