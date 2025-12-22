import { Experiment } from '../classes/Experiment';
import { GraphStructure } from '../classes/GraphStructure';
import { CreateExperimentInput } from '../classes/CreateExperimentInput';
import { UpdateExperimentInput } from '../classes/UpdateExperimentInput';
import { GraphNode } from '../classes/GraphNode';
import { GraphEdge } from '../classes/GraphEdge';

export class ExperimentManager {
  private readonly experimentItems: Experiment[] = [
    {
      id: 'exp-1',
      name: 'Protein folding baseline',
      description: 'Перевірка стабільності моделі на базовому датасеті.',
      status: 'running',
      runs: 12,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3),
      fileName: 'protein-baseline.csv',
      graph: this.buildGraph('exp-1', [
        {
          id: 'n1',
          label: 'Input',
          type: 'source',
          children: [
            {
              id: 'n1-1',
              label: 'Preprocess',
              type: 'compute',
              children: [
                {
                  id: 'n1-1-1',
                  label: 'Model',
                  type: 'compute',
                  children: [{ id: 'n1-1-1-1', label: 'Results', type: 'sink', children: [] }],
                },
              ],
            },
          ],
        },
      ]),
    },
    {
      id: 'exp-2',
      name: 'Dataset v2 benchmarking',
      description: 'Порівняння швидкості та точності після оновлення даних.',
      status: 'completed',
      runs: 34,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 8),
      fileName: 'dataset-v2.zip',
      graph: this.buildGraph('exp-2', [
        {
          id: 'n1',
          label: 'Loader',
          type: 'source',
          children: [
            {
              id: 'n1-1',
              label: 'Benchmark',
              type: 'compute',
              children: [],
            },
          ],
        },
      ]),
    },
    {
      id: 'exp-3',
      name: 'Hyperparameter sweep',
      description: 'Сітковий пошук оптимальних параметрів для нової архітектури.',
      status: 'queued',
      runs: 5,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1),
      fileName: 'hparams.json',
      graph: this.buildGraph('exp-3', [
        {
          id: 'n1',
          label: 'Config',
          type: 'source',
          children: [
            {
              id: 'n1-1',
              label: 'Sweep',
              type: 'compute',
              children: [{ id: 'n1-1-1', label: 'Report', type: 'sink', children: [] }],
            },
          ],
        },
      ]),
    },
  ];

  list(): Experiment[] {
    return this.experimentItems;
  }

  getById(id: string): Experiment | undefined {
    return this.experimentItems.find((item) => item.id === id);
  }

  create(input: CreateExperimentInput): Experiment {
    const id = `exp-${this.experimentItems.length + 1}`;
    const graphId = `graph-${this.experimentItems.length + 1}`;
    const baseNodeId = `n${this.experimentItems.length + 1}`;

    const graph = this.buildGraph(
      id,
      [
        {
          id: `${baseNodeId}-input`,
          label: 'Input',
          type: 'source',
          children: [
            {
              id: `${baseNodeId}-process`,
              label: 'Process',
              type: 'compute',
              children: [
                { id: `${baseNodeId}-output`, label: 'Output', type: 'sink', children: [] },
              ],
            },
          ],
        },
      ],
      [
        { id: `${graphId}-edge-1`, from: `${baseNodeId}-input`, to: `${baseNodeId}-process` },
        { id: `${graphId}-edge-2`, from: `${baseNodeId}-process`, to: `${baseNodeId}-output` },
      ]
    );

    const experiment: Experiment = {
      id,
      name: input.name,
      description: input.description,
      status: 'queued',
      runs: 0,
      createdAt: new Date(),
      fileName: input.fileName,
      graph,
    };

    this.experimentItems.unshift(experiment);
    return experiment;
  }

  update(input: UpdateExperimentInput): Experiment {
    const experiment = this.getById(input.id);
    if (!experiment) throw new Error('Experiment not found');

    if (typeof input.name === 'string') experiment.name = input.name;
    if (typeof input.description === 'string') experiment.description = input.description;

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
}
