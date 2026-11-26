import { Types } from 'mongoose';
import { ExperimentModel } from '../../experiments/models/ExperimentModel';
import { ExperimentOperation } from '../../experiments/enums';
import { ObjectIdOrString } from '../../../types/context';

export type ExperimentLockResult =
  | { acquired: true; token: string }
  | { acquired: false; heldBy?: ExperimentOperation };

/**
 * One operation at a time per experiment: an optimization attempt holds the lock from the check of
 * its runs to its final status, a re-run admission from the creation of the run to its queueing.
 * Taking it is one conditional update, so of two callers exactly one gets it. It is a lease: if the
 * holder dies, the lock stops blocking once `expiresAt` has passed.
 */
export class ExperimentLock {
  async acquire(
    experimentId: ObjectIdOrString,
    operation: ExperimentOperation,
    leaseMs: number
  ): Promise<ExperimentLockResult> {
    const token = new Types.ObjectId().toHexString();
    const now = new Date();
    const taken = await ExperimentModel.findOneAndUpdate(
      {
        _id: experimentId,
        $or: [{ operationLock: { $exists: false } }, { 'operationLock.expiresAt': { $lte: now } }],
      },
      {
        $set: {
          operationLock: { token, operation, expiresAt: new Date(now.getTime() + leaseMs) },
        },
      },
      { new: true, projection: { _id: 1 } }
    ).lean();
    if (taken) return { acquired: true, token };
    const holder = await ExperimentModel.findById(experimentId, { operationLock: 1 }).lean();
    return { acquired: false, heldBy: holder?.operationLock?.operation };
  }

  /** Releases the lock only if this holder still has it, so a later holder is never freed. */
  async release(experimentId: ObjectIdOrString, token: string) {
    await ExperimentModel.updateOne(
      { _id: experimentId, 'operationLock.token': token },
      { $unset: { operationLock: 1 } }
    );
  }
}
