import { Types } from 'mongoose';

import { PipelineModel } from '../../../core/pipeline/models/PipelineModel';
import { ObjectIdOrString } from '../../../types/context';
import { UploadedFileModel } from '../../files/models/UploadedFileModel';
import { ExperimentModel } from '../models/ExperimentModel';
import { buildGraphReportPdf } from '../utils/buildGraphReportPdf';
import { GraphManager } from './GraphManager';

/** Builds the PDF report of an experiment for its owner. */
export class ExperimentReportService {
  private readonly graphManager = new GraphManager();

  constructor(private readonly render: typeof buildGraphReportPdf = buildGraphReportPdf) {}

  /**
   * The report, or null when the experiment does not exist or belongs to another user: both get
   * the same answer, so the caller cannot tell whether someone else's id exists.
   */
  async buildForOwner(userId: ObjectIdOrString, experimentId: string): Promise<Buffer | null> {
    if (!Types.ObjectId.isValid(experimentId)) return null;
    const experiment = await ExperimentModel.findOne({
      _id: experimentId,
      createdById: userId,
    }).lean();
    if (!experiment) return null;

    const graph = await this.graphManager.getByExperimentId(experimentId);
    const pipelines = await PipelineModel.find({ experimentId }).lean();
    const sourceFile = experiment.fileId
      ? await UploadedFileModel.findById(experiment.fileId).lean()
      : null;
    return this.render({
      experimentId,
      experimentName: experiment.name,
      description: experiment.description,
      createdAt: experiment.createdAt ? new Date(experiment.createdAt) : undefined,
      graph: {
        settings: graph.settings
          ? {
              metrics: graph.settings.metrics
                ? {
                    accuracy: graph.settings.metrics.accuracy,
                    f1: graph.settings.metrics.f1,
                    rocAuc: graph.settings.metrics.rocAuc,
                    ntps: graph.settings.metrics.ntps,
                  }
                : undefined,
              queues: graph.settings.queues ? [...graph.settings.queues] : [],
              folds: graph.settings.folds,
              hyperOptimizationMinutesPerPipeline:
                graph.settings.hyperOptimizationMinutesPerPipeline,
              predictDataPercent: graph.settings.predictDataPercent,
            }
          : undefined,
        computationMode: graph.computationMode ?? undefined,
      },
      file: sourceFile
        ? {
            filename: sourceFile.filename,
            sizeMb: sourceFile.sizeMb,
            status: sourceFile.status,
            uploadedAt: sourceFile.uploadedAt ? new Date(sourceFile.uploadedAt) : undefined,
            uploadedByName: sourceFile.uploadedByName,
          }
        : undefined,
      nodes: graph.nodes ?? [],
      pipelines: pipelines.map((pipeline) => ({
        _id: String(pipeline._id),
        queue: pipeline.queue,
        pathNodeIds: (pipeline.pathNodeIds ?? []).map((id: any) => String(id)),
        computingResult: pipeline.computingResult as any,
        optimizationScores: pipeline.optimizationScores as number[] | undefined,
        machineInfo: pipeline.machineInfo as any,
        createdAt: pipeline.createdAt ? new Date(pipeline.createdAt) : undefined,
        updatedAt: pipeline.updatedAt ? new Date(pipeline.updatedAt) : undefined,
      })),
      optimization: experiment.optimization
        ? {
            bestPipelineId: experiment.optimization.bestPipelineId?.toString(),
            bestScore: experiment.optimization.bestScore ?? undefined,
            progress: experiment.optimization.progress ?? undefined,
            status: experiment.optimization.status ?? undefined,
            history:
              (experiment.optimization.history as any[])?.map((item) => ({
                createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
                message: item.message,
                status: item.status,
              })) ?? [],
          }
        : undefined,
    });
  }
}
