import { prop } from '@typegoose/typegoose';
import { TimeStamps } from '@typegoose/typegoose/lib/defaultClasses';
import { Types } from 'mongoose';
import { Field, ID, ObjectType } from 'type-graphql';
import { PipelineMachineInfo } from '../../../core/pipeline/classes/PipelineMachineInfo';
import { ExperimentOptimization } from './ExperimentOptimization';

@ObjectType()
export class Experiment extends TimeStamps {
  @Field(() => ID)
  _id!: Types.ObjectId;

  @prop({ type: () => Types.ObjectId, required: true, index: true })
  createdById!: Types.ObjectId;

  @Field()
  @prop({ required: true, trim: true })
  name!: string;

  @Field({ nullable: true })
  @prop({ trim: true })
  description?: string;

  @Field(() => ID, { nullable: true })
  @prop({ type: () => Types.ObjectId })
  fileId?: Types.ObjectId;

  @Field(() => [PipelineMachineInfo], { nullable: true })
  @prop({ _id: false, type: () => [PipelineMachineInfo], default: [] })
  computationHosts?: PipelineMachineInfo[];

  @Field(() => ExperimentOptimization, { nullable: true })
  @prop({ _id: false, type: () => ExperimentOptimization })
  optimization?: ExperimentOptimization;

  @Field(() => Date)
  declare createdAt: Date;
}
