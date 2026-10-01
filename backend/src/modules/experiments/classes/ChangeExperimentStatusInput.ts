import { Field, ID, InputType } from 'type-graphql';
import { ExperimentStatus } from './ExperimentStatus';
import { ObjectIdOrString } from '../../../types/context';

@InputType()
export class ChangeExperimentStatusInput {
  @Field(() => ID)
  experimentId!: ObjectIdOrString;

  @Field(() => ExperimentStatus)
  status!: ExperimentStatus;
}
