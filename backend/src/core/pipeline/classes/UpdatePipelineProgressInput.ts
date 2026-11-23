import { Field, Float, ID, InputType } from 'type-graphql';
import { ObjectIdOrString } from '../../../types/context';

@InputType({ description: 'Progress report of a worker for a running pipeline.' })
export class UpdatePipelineProgressInput {
  @Field(() => ID, { description: 'Id of the pipeline.' })
  pipelineId!: ObjectIdOrString;

  @Field(() => Float, {
    nullable: true,
    description: 'Progress in percent (0 to 100). Leave it empty to send only a message.',
  })
  progress?: number;

  @Field({
    nullable: true,
    description: 'Message for the pipeline history, for example the current step or an error.',
  })
  message?: string;

  /** The claimed execution sending the report; see `Pipeline.executionId`. */
  @Field(() => ID, {
    description:
      'The execution that sends the report, as returned by `claimExperimentRun`. A report of an execution that is no longer current is ignored.',
  })
  executionId!: string;
}
