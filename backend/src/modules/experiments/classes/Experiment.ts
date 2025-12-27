import { prop } from '@typegoose/typegoose';
import { TimeStamps } from '@typegoose/typegoose/lib/defaultClasses';
import { Types } from 'mongoose';
import { Field, ID, ObjectType } from 'type-graphql';
import { ExperimentStatus } from './ExperimentStatus';
import { ComputationMachineInfo } from '../../computations/classes/ComputationMachineInfo';

@ObjectType()
export class Experiment extends TimeStamps {
  @Field(() => ID)
  _id!: Types.ObjectId;

  @Field()
  @prop({ required: true, trim: true })
  name!: string;

  @Field({ nullable: true })
  @prop({ trim: true })
  description?: string;

  @Field(() => ExperimentStatus)
  @prop({
    required: true,
    enum: ExperimentStatus,
    type: () => String,
    default: ExperimentStatus.queued,
  })
  status!: ExperimentStatus;

  @Field(() => ID, { nullable: true })
  @prop({ type: () => Types.ObjectId })
  fileId?: Types.ObjectId;

  @Field(() => [ComputationMachineInfo], { nullable: true })
  @prop({ _id: false, type: () => [ComputationMachineInfo], default: [] })
  computationHosts?: ComputationMachineInfo[];

  @Field(() => Date)
  declare createdAt: Date;
}
