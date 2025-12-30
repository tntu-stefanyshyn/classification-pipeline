import { Types } from 'mongoose';
import { Experiment } from '../classes/Experiment';
import { CreateExperimentInput } from '../classes/CreateExperimentInput';
import { GenerateExperimentGraphInput } from '../classes/GenerateExperimentGraphInput';
import { UpdateExperimentInput } from '../classes/UpdateExperimentInput';
import { ExperimentModel } from '../models/ExperimentModel';
import { GraphManager } from './GraphManager';
import { ExperimentStatus } from '../classes/ExperimentStatus';
import { PipelineManager } from '../../../core/pipeline/services/PipelineManager';
import { WorkflowManager } from '../../../core/workflow/services/WorkflowManager';
import { WorkflowType } from '../../../core/workflow/enums';
import { Transitions } from '../../../core/workflow/services/WorkflowManager.types.';
import { ChangeExperimentStatusInput } from '../classes/ChangeExperimentStatusInput';

export class ExperimentManager {
  private readonly graphManager = new GraphManager();
  private readonly pipelineManager = new PipelineManager();
  private readonly workflowManager = new WorkflowManager();

  async list(): Promise<Experiment[]> {
    const experiments = await ExperimentModel.find().sort({ createdAt: -1 }).lean();
    return experiments;
  }

  async getById(_id: string): Promise<Experiment> {
    const experiment = await ExperimentModel.findById(_id).lean();
    if (!experiment) throw new Error('Експеремент не знайдено');
    return experiment;
  }

  async create(input: CreateExperimentInput): Promise<Experiment> {
    const name = input.name.trim();
    if (!name) throw new Error('Name is required');

    const description = input.description?.trim();
    const fileId = input.fileId?.trim();
    if (fileId && !Types.ObjectId.isValid(fileId)) {
      throw new Error('File _id is invalid');
    }
    const experiment = await ExperimentModel.create({
      name,
      description,
      fileId: fileId ? new Types.ObjectId(fileId) : undefined,
    });

    await this.graphManager.createDefaultGraph(experiment._id);
    return experiment.toObject({ getters: true });
  }

  async update(input: UpdateExperimentInput): Promise<Experiment> {
    const trimmedId = input._id.trim();
    if (!trimmedId) throw new Error('Experiment _id is required');

    const existingExperiment = await ExperimentModel.findById(trimmedId).lean();
    if (!existingExperiment) throw new Error('Experiment not found');
    if (
      existingExperiment.status === ExperimentStatus.computing ||
      existingExperiment.status === ExperimentStatus.completed
    ) {
      throw new Error('Редагування експерименту недоступне після початку обчислень.');
    }

    const update: Partial<Experiment> = {};
    const unset: Record<string, 1> = {};

    if (typeof input.name === 'string') {
      const name = input.name.trim();
      if (!name) throw new Error('Name is required');
      update.name = name;
    }

    if (typeof input.description === 'string') {
      update.description = input.description.trim();
    }

    if (input.fileId !== undefined) {
      const trimmedFileId = input.fileId?.trim() ?? '';
      if (!trimmedFileId) {
        unset.fileId = 1;
      } else {
        if (!Types.ObjectId.isValid(trimmedFileId)) {
          throw new Error('File _id is invalid');
        }
        update.fileId = new Types.ObjectId(trimmedFileId);
      }
    }

    const requiresGraphUpdate =
      input.graphNodes !== undefined || input.graphComputationMode !== undefined;
    if (requiresGraphUpdate) {
      const existingExperiment = await ExperimentModel.findById(trimmedId).lean();
      if (!existingExperiment) throw new Error('Experiment not found');
    }

    if (input.graphNodes !== undefined) {
      if (!Array.isArray(input.graphNodes)) {
        throw new Error('Graph nodes must be an array');
      }
      await this.graphManager.updateGraph(trimmedId, input.graphNodes);
      update.status = ExperimentStatus.configuring;
    }

    if (input.graphSettings !== undefined) {
      await this.graphManager.updateGraphSettings(trimmedId, input.graphSettings);
      update.status = ExperimentStatus.configuring;
    }

    if (input.graphComputationMode !== undefined) {
      await this.graphManager.updateComputationMode(trimmedId, input.graphComputationMode);
    }

    const updateOps =
      Object.keys(unset).length > 0 ? { $set: update, $unset: unset } : { $set: update };
    const experiment = await ExperimentModel.findOneAndUpdate({ _id: trimmedId }, updateOps, {
      new: true,
    }).lean();

    if (!experiment) {
      throw new Error('Experiment not found');
    }

    return experiment;
  }

  async generateGraph(input: GenerateExperimentGraphInput): Promise<Experiment> {
    const trimmedId = input._id.trim();
    if (!trimmedId) throw new Error('Experiment _id is required');

    const experiment = await ExperimentModel.findById(trimmedId).lean();
    if (!experiment) {
      throw new Error('Experiment not found');
    }
    if (
      experiment.status === ExperimentStatus.computing ||
      experiment.status === ExperimentStatus.completed
    ) {
      throw new Error('Редагування графа недоступне після початку обчислень.');
    }

    await this.graphManager.generateGraphFromSelections(trimmedId, input.stages ?? []);
    await ExperimentModel.updateOne(
      { _id: trimmedId },
      { $set: { status: ExperimentStatus.configuring } }
    ).exec();

    return experiment;
  }

  private readonly transitions: Transitions<ExperimentStatus> = [
    {
      from: ExperimentStatus.creating,
      to: ExperimentStatus.configuring,
    },
    {
      from: ExperimentStatus.configuring,
      to: ExperimentStatus.computing,
      sideEffect: async ({ instanceId }) => {
        await this.pipelineManager.generatePipelinesFromGraphStructure(instanceId);
      },
    },
    {
      from: ExperimentStatus.computing,
      to: ExperimentStatus.completed,
    },
  ];

  async changeStatus({ experimentId, status }: ChangeExperimentStatusInput) {
    await this.workflowManager.changeStatus({
      instanceId: experimentId,
      status,
      transitions: this.transitions,
      type: WorkflowType.EXPERIMENT,
    });

    return true;
  }
}
