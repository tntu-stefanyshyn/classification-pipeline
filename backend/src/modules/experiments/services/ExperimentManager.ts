import { randomUUID } from 'crypto';
import { Experiment } from '../classes/Experiment';
import { GraphStructure } from '../classes/GraphStructure';
import { CreateExperimentInput } from '../classes/CreateExperimentInput';
import { UpdateExperimentInput } from '../classes/UpdateExperimentInput';
import { GraphNode } from '../classes/GraphNode';
import { GraphEdge } from '../classes/GraphEdge';
import { ExperimentModel } from '../models/ExperimentModel';

export class ExperimentManager {
  async list(): Promise<Experiment[]> {
    return ExperimentModel.find().sort({ createdAt: -1 }).lean<Experiment>().exec();
  }

  async getById(id: string): Promise<Experiment | null> {
    const trimmedId = id.trim();
    if (!trimmedId) throw new Error('Experiment id is required');
    return ExperimentModel.findOne({ id: trimmedId }).lean<Experiment>().exec();
  }

  async create(input: CreateExperimentInput): Promise<Experiment> {
    const name = input.name.trim();
    if (!name) throw new Error('Name is required');

    const id = `exp-${randomUUID()}`;
    const description = input.description?.trim();
    const fileName = input.fileName?.trim();
    const graph = this.buildDefaultGraph(id);

    const experiment = await ExperimentModel.create({
      id,
      name,
      description: description || undefined,
      status: 'queued',
      runs: 0,
      createdAt: new Date(),
      fileName: fileName || undefined,
      graph,
    });

    return experiment.toObject() as Experiment;
  }

  async update(input: UpdateExperimentInput): Promise<Experiment> {
    const trimmedId = input.id.trim();
    if (!trimmedId) throw new Error('Experiment id is required');

    const update: Partial<Experiment> = {};

    if (typeof input.name === 'string') {
      const name = input.name.trim();
      if (!name) throw new Error('Name is required');
      update.name = name;
    }

    if (typeof input.description === 'string') {
      update.description = input.description.trim();
    }

    const experiment = await ExperimentModel.findOneAndUpdate({ id: trimmedId }, update, {
      new: true,
    })
      .lean<Experiment>()
      .exec();

    if (!experiment) {
      throw new Error('Experiment not found');
    }

    return experiment;
  }

  private buildGraph(
    experimentId: string,
    nodes: GraphNode[],
    edges?: GraphEdge[]
  ): GraphStructure {
    return {
      id: `graph-${experimentId}`,
      experimentId,
      nodes,
      edges: edges ?? this.buildEdgesFromNodes(nodes),
      createdAt: new Date(),
    };
  }

  private buildEdgesFromNodes(nodes: GraphNode[]): GraphEdge[] {
    const edges: GraphEdge[] = [];

    const walk = (parent: GraphNode) => {
      parent.children?.forEach((child) => {
        edges.push({ id: `${parent.id}-${child.id}`, from: parent.id, to: child.id });
        walk(child);
      });
    };

    nodes.forEach((n) => walk(n));
    return edges;
  }

  private buildDefaultGraph(experimentId: string): GraphStructure {
    const inputId = `node-${randomUUID()}`;
    const processId = `node-${randomUUID()}`;
    const outputId = `node-${randomUUID()}`;

    const nodes: GraphNode[] = [
      {
        id: inputId,
        label: 'Input',
        type: 'source',
        children: [
          {
            id: processId,
            label: 'Process',
            type: 'compute',
            children: [{ id: outputId, label: 'Output', type: 'sink', children: [] }],
          },
        ],
      },
    ];

    return this.buildGraph(experimentId, nodes);
  }
}
