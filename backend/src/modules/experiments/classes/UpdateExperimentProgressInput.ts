import { Field, Float, ID, InputType } from 'type-graphql';
import { ObjectIdOrString } from '../../../types/context';
import { OptimizationStatus } from './OptimizationStatus';

@InputType()
export class UpdateExperimentProgressInput {
  @Field(() => ID)
  experimentId!: ObjectIdOrString;

  @Field(() => Float, { nullable: true })
  progress?: number;

  @Field({ nullable: true })
  message?: string;

  @Field(() => OptimizationStatus, { nullable: true })
  status?: OptimizationStatus;
}
