import { Field, ID, InputType } from 'type-graphql';
import { PipelineStatus } from '../../../core/pipeline/enums';

@InputType({
  description:
    'A pipeline the user confirmed for a bulk action, as they saw it, so a pipeline that was stopped and restarted meanwhile is skipped instead of acted on.',
})
export class ConfirmedRunInput {
  @Field(() => ID, { description: 'Id of the pipeline.' })
  pipelineId!: string;

  @Field(() => ID, {
    nullable: true,
    description: 'The `executionId` the user saw; empty for a pipeline that never ran.',
  })
  executionId?: string | null;

  @Field(() => PipelineStatus, {
    nullable: true,
    description:
      'The status the user saw. A `queued` pipeline the user saw may since have been taken by a worker (its next execution); any other change of execution counts as a different run.',
  })
  status?: PipelineStatus | null;
}
