import { Types } from 'mongoose';
import { WorkflowType } from '../../../core/workflow/enums';
import { WorkflowModel } from '../../../core/workflow/model/WorkflowModel';
import { ExperimentStatus } from '../../experiments/classes/ExperimentStatus';
import { ExperimentModel } from '../../experiments/models/ExperimentModel';
import { StorageClient } from '../../storage/services/StorageClient';
import { UploadedFile } from '../classes/UploadedFile';
import { UploadedFileUsage } from '../classes/UploadedFileUsage';
import { UploadedFileModel } from '../models/UploadedFileModel';

const BLOCKING_EXPERIMENT_STATUSES = [ExperimentStatus.computing, ExperimentStatus.optimization];

type FileUsageEntry = {
  _id: Types.ObjectId;
  name: string;
  status: ExperimentStatus;
  own: boolean;
  blocking: boolean;
};

// Other users' experiments are only counted, never named.
const describeUsages = (usages: FileUsageEntry[]) => {
  const names = usages.filter((usage) => usage.own).map((usage) => `"${usage.name}"`);
  const otherCount = usages.length - names.length;
  return (otherCount > 0 ? [...names, `інших експериментів: ${otherCount}`] : names).join(', ');
};

const assertDetachAllowed = (usages: FileUsageEntry[], detachExperimentIds: string[]) => {
  const blocking = usages.filter((usage) => usage.blocking);
  if (blocking.length > 0) {
    throw new Error(
      `Файл не можна видалити, поки триває обчислення або оптимізація експериментів (${describeUsages(blocking)}). Дочекайтеся завершення.`
    );
  }
  const confirmed = new Set(detachExperimentIds.map((id) => id.trim()));
  const unconfirmed = usages.filter((usage) => usage.own && !confirmed.has(String(usage._id)));
  if (unconfirmed.length > 0) {
    throw new Error(
      `Файл використовується в експериментах (${describeUsages(unconfirmed)}). Підтвердіть відʼєднання файлу від них і повторіть видалення.`
    );
  }
};

type CreateFileInput = {
  filename: string;
  sizeMb: number;
  status?: string;
  storageKey: string;
  uploadedById?: string;
  uploadedByName?: string;
};

export class FileStore {
  private storage?: StorageClient;

  async listByUser(userId: string): Promise<UploadedFile[]> {
    const normalizedId = userId.trim();
    if (!normalizedId || !Types.ObjectId.isValid(normalizedId)) {
      throw new Error('Invalid user id');
    }
    return UploadedFileModel.find({ uploadedById: normalizedId }).sort({ uploadedAt: -1 }).lean();
  }

  async create(input: CreateFileInput): Promise<UploadedFile> {
    const filename = input.filename.trim();
    if (!filename) throw new Error('Filename is required');
    if (!filename.toLowerCase().endsWith('.csv')) {
      throw new Error('Only CSV files are allowed');
    }
    const storageKey = input.storageKey?.trim();
    if (!storageKey) throw new Error('Storage key is required');
    if (input.sizeMb <= 0) throw new Error('sizeMb must be positive');

    const status = input.status?.trim();
    const uploadedById = input.uploadedById?.trim() ?? '';
    const uploadedByName = input.uploadedByName?.trim() ?? '';
    const file = await UploadedFileModel.create({
      filename,
      storageKey,
      sizeMb: input.sizeMb,
      status: status || undefined,
      uploadedAt: new Date(),
      uploadedByName: uploadedByName || undefined,
      uploadedById:
        uploadedById && Types.ObjectId.isValid(uploadedById)
          ? new Types.ObjectId(uploadedById)
          : undefined,
    });

    return file.toObject({ getters: true });
  }

  async getUsage(_id: string, userId: string): Promise<UploadedFileUsage> {
    const { fileId, ownerId } = await this.findOwnedFile(_id, userId);
    const usages = await this.collectUsages(fileId, ownerId);
    const own = usages.filter((usage) => usage.own);
    return {
      experiments: own.map(({ _id, name, status, blocking }) => ({ _id, name, status, blocking })),
      otherExperimentsCount: usages.length - own.length,
      blocked: usages.some((usage) => usage.blocking),
    };
  }

  // `detachExperimentIds` is the caller's confirmation: every own experiment still using the
  // file must be listed, so experiments that started using it after the review are not detached.
  async remove(
    _id: string,
    userId: string,
    detachExperimentIds: string[] = []
  ): Promise<UploadedFile> {
    const { file, fileId, ownerId } = await this.findOwnedFile(_id, userId);
    if (!file.storageKey) {
      throw new Error('Storage key is missing for file');
    }

    // Mark first, then read usages: an experiment attaching this file or starting to compute
    // concurrently either sees the mark (ExperimentManager) or is seen here.
    const mark = new Date();
    await UploadedFileModel.updateOne({ _id: fileId }, { $set: { deletingAt: mark } });
    try {
      const usages = await this.collectUsages(fileId, ownerId);
      assertDetachAllowed(usages, detachExperimentIds);
      if (usages.length > 0) {
        await ExperimentModel.updateMany(
          { _id: { $in: usages.map((usage) => usage._id) }, fileId },
          { $unset: { fileId: 1 } }
        );
      }
      await this.getStorage().deleteObject(file.storageKey);
    } catch (error) {
      // Only clear our own mark; a concurrent retry may have replaced it.
      await UploadedFileModel.updateOne(
        { _id: fileId, deletingAt: mark },
        { $unset: { deletingAt: '' } }
      );
      throw error;
    }
    // If this fails the object is already gone and the file stays marked as deleting;
    // a retry finishes the job because deleting a missing S3 key succeeds.
    await UploadedFileModel.deleteOne({ _id: fileId });
    return file;
  }

  private async findOwnedFile(_id: string, userId: string) {
    const fileId = _id.trim();
    if (!fileId) throw new Error('File _id is required');
    const ownerId = userId.trim();
    if (!ownerId || !Types.ObjectId.isValid(ownerId)) {
      throw new Error('Invalid user id');
    }

    const file = await UploadedFileModel.findOne({ _id: fileId, uploadedById: ownerId }).lean();
    if (!file) {
      throw new Error('File not found');
    }
    return { file, fileId, ownerId };
  }

  private async collectUsages(fileId: string, ownerId: string): Promise<FileUsageEntry[]> {
    const experiments = await ExperimentModel.find({ fileId }).select('name createdById').lean();
    if (experiments.length === 0) return [];

    // Experiment statuses live in the workflows collection.
    const workflows = await WorkflowModel.find({
      type: WorkflowType.EXPERIMENT,
      instanceId: { $in: experiments.map((experiment) => experiment._id) },
    }).lean();
    const statusById = new Map(
      workflows.map((workflow) => [String(workflow.instanceId), workflow.status])
    );

    return experiments.map((experiment) => {
      const status = (statusById.get(String(experiment._id)) ??
        ExperimentStatus.creating) as ExperimentStatus;
      return {
        _id: experiment._id,
        name: experiment.name,
        status,
        own: String(experiment.createdById) === ownerId,
        blocking: BLOCKING_EXPERIMENT_STATUSES.includes(status),
      };
    });
  }

  private getStorage(): StorageClient {
    if (!this.storage) {
      this.storage = new StorageClient();
    }
    return this.storage;
  }
}

export const fileStore = new FileStore();
