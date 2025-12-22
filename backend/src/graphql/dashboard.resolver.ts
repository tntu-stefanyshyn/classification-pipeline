import {
  Arg,
  Field,
  ID,
  InputType,
  Int,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from 'type-graphql';

@ObjectType()
class UploadedFile {
  @Field(() => ID)
  id!: string;

  @Field()
  filename!: string;

  @Field(() => Int)
  sizeMb!: number;

  @Field()
  status!: string;

  @Field(() => Date)
  uploadedAt!: Date;
}

@ObjectType()
class GraphNode {
  @Field(() => ID)
  id!: string;

  @Field()
  label!: string;

  @Field({ nullable: true })
  type?: string;

  @Field(() => [GraphNode])
  children!: GraphNode[];
}

@ObjectType()
class GraphEdge {
  @Field(() => ID)
  id!: string;

  @Field()
  from!: string;

  @Field()
  to!: string;
}

@ObjectType()
class GraphStructure {
  @Field(() => ID)
  id!: string;

  @Field()
  experimentId!: string;

  @Field(() => [GraphNode])
  nodes!: GraphNode[];

  @Field(() => [GraphEdge])
  edges!: GraphEdge[];

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType()
class Experiment {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field({ nullable: true })
  description?: string;

  @Field()
  status!: string;

  @Field(() => Int)
  runs!: number;

  @Field(() => Date)
  createdAt!: Date;

  @Field({ nullable: true })
  fileName?: string;

  @Field(() => GraphStructure, { nullable: true })
  graph?: GraphStructure;
}

@InputType()
class CreateExperimentInput {
  @Field()
  name!: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  fileName?: string;
}

@InputType()
class UpdateExperimentInput {
  @Field(() => ID)
  id!: string;

  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  description?: string;
}

@Resolver()
export class DashboardResolver {
  private readonly files: UploadedFile[] = [
    {
      id: 'file-1',
      filename: 'microscopy-scan.tiff',
      sizeMb: 248,
      status: 'processed',
      uploadedAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
    },
    {
      id: 'file-2',
      filename: 'cell-growth.csv',
      sizeMb: 32,
      status: 'queued',
      uploadedAt: new Date(Date.now() - 1000 * 60 * 60 * 6),
    },
    {
      id: 'file-3',
      filename: 'report-draft.pdf',
      sizeMb: 12,
      status: 'ready',
      uploadedAt: new Date(Date.now() - 1000 * 60 * 60 * 22),
    },
  ];

  private readonly experimentItems: Experiment[] = [
    {
      id: 'exp-1',
      name: 'Protein folding baseline',
      description: 'Перевірка стабільності моделі на базовому датасеті.',
      status: 'running',
      runs: 12,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3),
      fileName: 'protein-baseline.csv',
      graph: {
        id: 'graph-1',
        experimentId: 'exp-1',
        nodes: [
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
        ],
        edges: [
          { id: 'e1', from: 'n1', to: 'n1-1' },
          { id: 'e2', from: 'n1-1', to: 'n1-1-1' },
          { id: 'e3', from: 'n1-1-1', to: 'n1-1-1-1' },
        ],
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3),
      },
    },
    {
      id: 'exp-2',
      name: 'Dataset v2 benchmarking',
      description: 'Порівняння швидкості та точності після оновлення даних.',
      status: 'completed',
      runs: 34,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 8),
      fileName: 'dataset-v2.zip',
      graph: {
        id: 'graph-2',
        experimentId: 'exp-2',
        nodes: [
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
        ],
        edges: [{ id: 'e1', from: 'n1', to: 'n1-1' }],
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 8),
      },
    },
    {
      id: 'exp-3',
      name: 'Hyperparameter sweep',
      description: 'Сітковий пошук оптимальних параметрів для нової архітектури.',
      status: 'queued',
      runs: 5,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1),
      fileName: 'hparams.json',
      graph: {
        id: 'graph-3',
        experimentId: 'exp-3',
        nodes: [
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
        ],
        edges: [
          { id: 'e1', from: 'n1', to: 'n1-1' },
          { id: 'e2', from: 'n1-1', to: 'n1-1-1' },
        ],
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1),
      },
    },
  ];

  @Query(() => [UploadedFile])
  uploadedFiles(): UploadedFile[] {
    return this.files;
  }

  @Query(() => [Experiment])
  experiments(): Experiment[] {
    return this.experimentItems;
  }

  @Query(() => Experiment, { nullable: true })
  experiment(@Arg('id', () => ID) id: string): Experiment | undefined {
    return this.experimentItems.find((item) => item.id === id);
  }

  @Mutation(() => Experiment)
  createExperiment(
    @Arg('input', () => CreateExperimentInput) input: CreateExperimentInput
  ): Experiment {
    const graphId = `graph-${this.experimentItems.length + 1}`;
    const baseNodeId = `n${this.experimentItems.length + 1}`;
    const experiment: Experiment = {
      id: `exp-${this.experimentItems.length + 1}`,
      name: input.name,
      description: input.description,
      status: 'queued',
      runs: 0,
      createdAt: new Date(),
      fileName: input.fileName,
      graph: {
        id: graphId,
        experimentId: `exp-${this.experimentItems.length + 1}`,
        nodes: [
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
        edges: [
          { id: `${graphId}-edge-1`, from: `${baseNodeId}-input`, to: `${baseNodeId}-process` },
          { id: `${graphId}-edge-2`, from: `${baseNodeId}-process`, to: `${baseNodeId}-output` },
        ],
        createdAt: new Date(),
      },
    };

    this.experimentItems.unshift(experiment);
    return experiment;
  }

  @Mutation(() => Experiment)
  updateExperiment(
    @Arg('input', () => UpdateExperimentInput) input: UpdateExperimentInput
  ): Experiment {
    const experiment = this.experimentItems.find((item) => item.id === input.id);
    if (!experiment) {
      throw new Error('Experiment not found');
    }

    if (typeof input.name === 'string') {
      experiment.name = input.name;
    }

    if (typeof input.description === 'string') {
      experiment.description = input.description;
    }

    return experiment;
  }
}
