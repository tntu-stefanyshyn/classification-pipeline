import type { Request } from 'express';

import { PipelineBaseService } from '../../../core/pipeline';
import { ObjectIdOrString } from '../../../types/context';
import { AuthFlow } from '../../auth/services/AuthFlow';
import { ExperimentModel } from '../models/ExperimentModel';
import { ExperimentManager } from './ExperimentManager';

export class ExperimentAccess {
  private readonly auth = new AuthFlow();
  private readonly experimentManager = new ExperimentManager();

  async assertExperimentOwner(req: Request, experimentId: ObjectIdOrString): Promise<void> {
    const user = await this.auth.me(req);
    await this.experimentManager.getById(experimentId, user._id.toString());
  }

  // A pipeline of another user gets the same error as a missing one, so its id is not confirmed.
  async assertPipelineOwner(req: Request, pipelineId: ObjectIdOrString): Promise<void> {
    const user = await this.auth.me(req);
    const { experimentId } = await PipelineBaseService.getById(pipelineId);
    const owned = await ExperimentModel.exists({ _id: experimentId, createdById: user._id });
    if (!owned) throw new Error('Конвеєр не знайдено');
  }

  async assertExperimentOwnerOrService(
    req: Request,
    experimentId: ObjectIdOrString
  ): Promise<void> {
    if (this.auth.isService(req)) return;
    await this.assertExperimentOwner(req, experimentId);
  }

  async assertPipelineOwnerOrService(req: Request, pipelineId: ObjectIdOrString): Promise<void> {
    if (this.auth.isService(req)) return;
    await this.assertPipelineOwner(req, pipelineId);
  }
}
