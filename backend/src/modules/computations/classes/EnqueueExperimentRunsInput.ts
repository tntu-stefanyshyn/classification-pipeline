import { Field, ID, InputType } from 'type-graphql';
import { ComputationQueue } from './ComputationQueue';
import { ObjectIdOrString } from '../../../types/context';

@InputType({ description: 'Request to queue the runs of an experiment.' })
export class EnqueueExperimentRunsInput {
  @Field(() => ID, { description: 'Id of the experiment.' })
  experimentId!: string;

  @Field(() => ComputationQueue, {
    description:
      'Queue to run in. It must be allowed by the graph settings and the computation mode.',
  })
  queue!: ComputationQueue;

  @Field(() => ID, {
    nullable: true,
    description: 'Queue only this pipeline. Send either `pipelineId` or `runAll`.',
  })
  pipelineId?: ObjectIdOrString;

  @Field({ nullable: true, description: 'Queue every pipeline of the experiment that is `idle`.' })
  runAll?: boolean;

  @Field({ nullable: true, description: 'Reserved. The backend does not read it yet.' })
  rerun?: boolean;
}
