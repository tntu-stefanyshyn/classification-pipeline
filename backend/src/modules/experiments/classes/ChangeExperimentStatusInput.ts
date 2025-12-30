import { Field, ID, InputType } from 'type-graphql';
import { ExperimentStatus } from './ExperimentStatus';

@InputType()
export class ChangeExperimentStatusInput {
  @Field()
  experimentId!: string;

  @Field(() => ExperimentStatus)
  status!: ExperimentStatus;
}
