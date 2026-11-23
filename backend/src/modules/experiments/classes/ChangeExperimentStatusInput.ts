import { Field, ID, InputType } from 'type-graphql';
import { ExperimentStatus } from './ExperimentStatus';
import { ObjectIdOrString } from '../../../types/context';

@InputType({
  description: 'Request to move an experiment to another status along the allowed transitions.',
})
export class ChangeExperimentStatusInput {
  @Field(() => ID, { description: 'Id of the experiment.' })
  experimentId!: ObjectIdOrString;

  @Field(() => ExperimentStatus, {
    description: 'The status to move to, for example `computing` to start the computations.',
  })
  status!: ExperimentStatus;
}
