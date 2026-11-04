import { PipelineBaseService } from '../../../core/pipeline';
import { ObjectIdOrString } from '../../../types/context';
import type { Principal } from '../../auth/classes/Principal';
import { ExperimentModel } from '../models/ExperimentModel';
import { ExperimentManager } from './ExperimentManager';

/** Ownership rules. Callers authenticate first and pass who is asking. */
export class ExperimentAccess {
  private readonly experimentManager = new ExperimentManager();

  async assertExperimentOwner(userId: ObjectIdOrString, experimentId: ObjectIdOrString) {
    await this.experimentManager.getById(experimentId, userId.toString());
  }

  // A pipeline of another user gets the same error as a missing one, so its id is not confirmed.
  async assertPipelineOwner(userId: ObjectIdOrString, pipelineId: ObjectIdOrString) {
    const { experimentId } = await PipelineBaseService.getById(pipelineId);
    const owned = await ExperimentModel.exists({ _id: experimentId, createdById: userId });
    if (!owned) throw new Error('Конвеєр не знайдено');
  }

  /** The service principal (compute workers) may access every experiment. */
  async assertExperimentAccess(principal: Principal, experimentId: ObjectIdOrString) {
    if (principal.kind === 'service') return;
    await this.assertExperimentOwner(principal.userId, experimentId);
  }

  async assertPipelineAccess(principal: Principal, pipelineId: ObjectIdOrString) {
    if (principal.kind === 'service') return;
    await this.assertPipelineOwner(principal.userId, pipelineId);
  }
}
