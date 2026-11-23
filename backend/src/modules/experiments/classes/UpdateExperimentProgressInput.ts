import { Field, Float, ID, InputType } from 'type-graphql';
import { ObjectIdOrString } from '../../../types/context';
import { OptimizationStatus } from './OptimizationStatus';

@InputType({ description: 'Progress report of the optimization container.' })
export class UpdateExperimentProgressInput {
  @Field(() => ID, { description: 'Id of the experiment.' })
  experimentId!: ObjectIdOrString;

  @Field(() => Float, { nullable: true, description: 'Progress in percent.' })
  progress?: number;

  @Field({ nullable: true, description: 'Message for the optimization history.' })
  message?: string;

  @Field(() => OptimizationStatus, { nullable: true, description: 'New optimization status.' })
  status?: OptimizationStatus;
}
