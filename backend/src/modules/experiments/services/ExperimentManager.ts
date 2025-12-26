import { Experiment } from '../classes/Experiment';
import { ExperimentStatus } from '../classes/ExperimentStatus';
import { CreateExperimentInput } from '../classes/CreateExperimentInput';
import { UpdateExperimentInput } from '../classes/UpdateExperimentInput';
import { ExperimentModel } from '../models/ExperimentModel';
import { GraphManager } from './GraphManager';

export class ExperimentManager {
  private readonly graphManager = new GraphManager();

  async list(): Promise<Experiment[]> {
    const experiments = await ExperimentModel.find()
      .sort({ createdAt: -1 })
      .lean<Experiment>()
      .exec();
    return experiments;
  }

  async getById(_id: string): Promise<Experiment | null> {
    const trimmedId = _id.trim();
    if (!trimmedId) throw new Error('Experiment _id is required');
    const experiment = await ExperimentModel.findById(trimmedId).lean<Experiment>().exec();
    if (!experiment) return null;
    return experiment;
  }

  async create(input: CreateExperimentInput): Promise<Experiment> {
    const name = input.name.trim();
    if (!name) throw new Error('Name is required');

    const description = input.description?.trim();
    const experiment = await ExperimentModel.create({
      name,
      description: description || undefined,
      status: ExperimentStatus.queued,
      createdAt: new Date(),
    });

    await this.graphManager.createDefaultGraph(experiment._id);
    return experiment.toObject() as Experiment;
  }

  async update(input: UpdateExperimentInput): Promise<Experiment> {
    const trimmedId = input._id.trim();
    if (!trimmedId) throw new Error('Experiment _id is required');

    const update: Partial<Experiment> = {};

    if (typeof input.name === 'string') {
      const name = input.name.trim();
      if (!name) throw new Error('Name is required');
      update.name = name;
    }

    if (typeof input.description === 'string') {
      update.description = input.description.trim();
    }

    if (input.graphNodes !== undefined) {
      if (!Array.isArray(input.graphNodes)) {
        throw new Error('Graph nodes must be an array');
      }
      const existingExperiment = await ExperimentModel.findById(trimmedId)
        .lean<Experiment>()
        .exec();
      if (!existingExperiment) throw new Error('Experiment not found');
      await this.graphManager.updateGraph(trimmedId, input.graphNodes);
    }

    const experiment = await ExperimentModel.findOneAndUpdate({ _id: trimmedId }, update, {
      new: true,
    })
      .lean<Experiment>()
      .exec();

    if (!experiment) {
      throw new Error('Experiment not found');
    }

    return experiment;
  }
}
