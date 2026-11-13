import { Field, ID, InputType } from 'type-graphql';
import { PipelineStatus } from '../enums';
import { ObjectIdOrString } from '../../../types/context';

@InputType({
  description:
    'Request to move a pipeline to another status. It cannot move a running pipeline out of `running` or into it: use `stopExperimentRun`, `claimExperimentRun`, `completePipeline` and `failExperimentRun` for that.',
})
export class ChangePipelineStatusInput {
  @Field(() => ID, { description: 'Id of the pipeline.' })
  pipelineId!: ObjectIdOrString;

  @Field(() => PipelineStatus, {
    description:
      'The status to move to (`idle` to take a queued pipeline out of the queue, `queued` to queue an idle one).',
  })
  status!: PipelineStatus;

  @Field(() => String, {
    nullable: true,
    description: 'Optional note stored in the pipeline history with the change.',
  })
  message?: string;
}
