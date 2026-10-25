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
import { WorkflowModel } from '../../../core/workflow/model/WorkflowModel';
import { WorkflowType } from '../../../core/workflow/enums';
import { Transitions } from '../../../core/workflow/services/WorkflowManager.types.';
import { ChangeExperimentStatusInput } from '../classes/ChangeExperimentStatusInput';
import { UpdateExperimentProgressInput } from '../classes/UpdateExperimentProgressInput';
import { OptimizationHistoryItem } from '../classes/OptimizationHistoryItem';
import { UpdateExperimentOptimizationResultInput } from '../classes/UpdateExperimentOptimizationResultInput';
import { ObjectIdOrString } from '../../../types/context';
import { UploadedFileModel } from '../../files/models/UploadedFileModel';

export class ExperimentManager {
  private readonly graphManager = new GraphManager();
  private readonly pipelineManager = new PipelineManager();
  private readonly workflowManager = new WorkflowManager();

  async list(userId: string): Promise<Experiment[]> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid user id');
    }
    const experiments = await ExperimentModel.find({ createdById: userId })
      .sort({ createdAt: -1 })
      .lean();
    return experiments;
  }

  async getById(_id: ObjectIdOrString, userId?: string): Promise<Experiment> {
    const query: Record<string, unknown> = { _id };
    if (userId) {
      if (!Types.ObjectId.isValid(userId)) throw new Error('Invalid user id');
      query.createdById = userId;
    }
    const experiment = await ExperimentModel.findOne(query).lean();
    if (!experiment) throw new Error('Експеремент не знайдено');
    return experiment;
  }

  async create(input: CreateExperimentInput, userId: string): Promise<Experiment> {
    const name = input.name.trim();
    if (!name) throw new Error('Name is required');
    if (!Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid user id');
    }

    const description = input.description?.trim();
    const fileId = input.fileId?.trim();
    if (fileId && !Types.ObjectId.isValid(fileId)) {
      throw new Error('File _id is invalid');
    }
    if (fileId) await this.assertFileAttachable(fileId);
    const experiment = await ExperimentModel.create({
      name,
      description,
      fileId: fileId ? new Types.ObjectId(fileId) : undefined,
      createdById: new Types.ObjectId(userId),
    });
    if (fileId) {
      try {
        await this.assertFileAttachable(fileId);
      } catch (error) {
        await ExperimentModel.deleteOne({ _id: experiment._id });
        throw error;
      }
    }

    await this.graphManager.createDefaultGraph(experiment._id);
    await this.workflowManager.create({
      instanceId: experiment._id,
      status: ExperimentStatus.creating,
      type: WorkflowType.EXPERIMENT,
    });
    return experiment.toObject({ getters: true });
  }

  async update(input: UpdateExperimentInput, userId: string): Promise<Experiment> {
    if (!Types.ObjectId.isValid(userId)) throw new Error('Invalid user id');
    const existingExperiment = await ExperimentModel.findOne({
      _id: input._id,
      createdById: userId,
    }).lean();
    if (!existingExperiment) throw new Error('Experiment not found');
    const workflow = await this.workflowManager.getWorkflow({
      instanceId: input._id,
      type: WorkflowType.EXPERIMENT,
    });
    if (
      workflow.status === ExperimentStatus.computing ||
      workflow.status === ExperimentStatus.optimization ||
      workflow.status === ExperimentStatus.completed
    ) {
      const canAttachMissingFile =
        !existingExperiment.fileId &&
        input.fileId !== undefined &&
        input.name === undefined &&
        input.description === undefined &&
        input.graphNodes === undefined &&
        input.graphSettings === undefined &&
        input.graphComputationMode === undefined;
      if (!canAttachMissingFile) {
        throw new Error('Редагування експерименту недоступне після початку обчислень.');
      }
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
        // The edit form always resends the current file; only a changed reference is checked, so
        // experiments whose file is already gone or being deleted stay editable.
        if (String(existingExperiment.fileId ?? '') !== trimmedFileId) {
          update.fileId = new Types.ObjectId(trimmedFileId);
          await this.assertFileAttachable(update.fileId);
        }
      }
    }

    const requiresGraphUpdate =
      input.graphNodes !== undefined || input.graphComputationMode !== undefined;
    if (requiresGraphUpdate) {
      const existingExperiment = await ExperimentModel.findById(input._id).lean();
      if (!existingExperiment) throw new Error('Experiment not found');
    }

    if (input.graphNodes !== undefined) {
      if (!Array.isArray(input.graphNodes)) {
        throw new Error('Graph nodes must be an array');
      }
      await this.graphManager.updateGraph(input._id, input.graphNodes);
    }

    if (input.graphSettings !== undefined) {
      await this.graphManager.updateGraphSettings(input._id, input.graphSettings);
    }

    if (input.graphComputationMode !== undefined) {
      await this.graphManager.updateComputationMode(input._id, input.graphComputationMode);
    }

    const updateOps =
      Object.keys(unset).length > 0 ? { $set: update, $unset: unset } : { $set: update };
    const experiment = await ExperimentModel.findOneAndUpdate(
      { _id: input._id, createdById: userId },
      updateOps,
      {
        new: true,
      }
    ).lean();

    if (!experiment) {
      throw new Error('Experiment not found');
    }

    if (update.fileId) {
      try {
        await this.assertFileAttachable(update.fileId);
      } catch (error) {
        // Only undo our own write: a later edit may already have replaced this reference.
        await ExperimentModel.updateOne(
          { _id: input._id, fileId: update.fileId },
          existingExperiment.fileId
            ? { $set: { fileId: existingExperiment.fileId } }
            : { $unset: { fileId: 1 } }
        );
        throw error;
      }
    }

    return experiment;
  }

  // Pairs with FileStore.remove, which marks the file and then looks for experiments using it.
  // Callers re-check after writing the reference, so one of the two always sees the other.
  private async assertFileAttachable(fileId: ObjectIdOrString) {
    const file = await UploadedFileModel.exists({
      _id: fileId,
      deletingAt: { $exists: false },
      deleteCommittedAt: { $exists: false },
    });
    if (!file) throw new Error('Файл не знайдено або він зараз видаляється.');
  }

  async generateGraph(input: GenerateExperimentGraphInput, userId: string): Promise<Experiment> {
    const trimmedId = input._id.trim();
    if (!trimmedId) throw new Error('Experiment _id is required');
    if (!Types.ObjectId.isValid(userId)) throw new Error('Invalid user id');

    const experiment = await ExperimentModel.findOne({
      _id: trimmedId,
      createdById: userId,
    }).lean();
    if (!experiment) {
      throw new Error('Experiment not found');
    }
    const workflow = await this.workflowManager.getWorkflow({
      instanceId: input._id,
      type: WorkflowType.EXPERIMENT,
    });
    if (
      workflow.status === ExperimentStatus.computing ||
      workflow.status === ExperimentStatus.optimization ||
      workflow.status === ExperimentStatus.completed
    ) {
      throw new Error('Редагування графа недоступне після початку обчислень.');
    }

    await this.graphManager.generateGraphFromSelections(trimmedId, input.stages ?? []);

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
        // Re-check after the status write, before any run exists: pairs with FileStore.remove,
        // which marks the file and then reads experiment statuses.
        try {
          await this.ensureExperimentFileReady(instanceId);
        } catch (error) {
          await WorkflowModel.updateOne(
            { instanceId, type: WorkflowType.EXPERIMENT, status: ExperimentStatus.computing },
            {
              $set: { status: ExperimentStatus.configuring },
              $push: {
                history: {
                  previousStatus: ExperimentStatus.computing,
                  nextStatus: ExperimentStatus.configuring,
                  message: error instanceof Error ? error.message : 'Файл експерименту недоступний',
                  createdAt: new Date(),
                },
              },
            }
          );
          throw error;
        }
        await this.pipelineManager.generatePipelinesFromGraphStructure(instanceId);
      },
    },
    {
      from: ExperimentStatus.computing,
      to: ExperimentStatus.optimization,
    },
    {
      from: ExperimentStatus.optimization,
      to: ExperimentStatus.completed,
    },
    {
      from: ExperimentStatus.completed,
      to: ExperimentStatus.optimization,
    },
  ];

  async changeStatus({ experimentId, status }: ChangeExperimentStatusInput) {
    if (status === ExperimentStatus.computing) {
      await this.ensureExperimentFileReady(experimentId);
    }

    await this.workflowManager.changeStatus({
      instanceId: experimentId,
      status,
      transitions: this.transitions,
      type: WorkflowType.EXPERIMENT,
    });

    return true;
  }

  private async ensureExperimentFileReady(experimentId: ObjectIdOrString) {
    const experiment = await this.getById(experimentId);
    if (!experiment.fileId) {
      throw new Error('Додайте CSV файл до експерименту перед запуском обчислень.');
    }

    const file = await UploadedFileModel.findById(experiment.fileId).lean();
    if (!file?.storageKey || file.deletingAt || file.deleteCommittedAt) {
      throw new Error('Файл експерименту не знайдено або він недоступний для обчислень.');
    }
  }

  async updateExperimentProgress({
    experimentId,
    progress,
    message,
    status,
  }: UpdateExperimentProgressInput): Promise<Experiment> {
    await ExperimentModel.updateOne(
      { _id: experimentId },
      {
        $set: {
          ...(typeof progress === 'number' ? { 'optimization.progress': progress } : {}),
          ...(status ? { 'optimization.status': status } : {}),
        },
        ...(message || status
          ? {
              $push: {
                'optimization.history': {
                  createdAt: new Date(),
                  ...(message ? { message } : {}),
                  ...(status ? { status } : {}),
                } satisfies OptimizationHistoryItem,
              },
            }
          : {}),
      }
    ).lean();

    return this.getById(experimentId);
  }

  async updateExperimentOptimizationResult({
    experimentId,
    bestPipelineId,
    score,
  }: UpdateExperimentOptimizationResultInput): Promise<Experiment> {
    await ExperimentModel.updateOne(
      { _id: experimentId },
      {
        $set: {
          'optimization.bestPipelineId': bestPipelineId,
          'optimization.bestScore': score,
        },
      }
    ).lean();

    return this.getById(experimentId);
  }
}
