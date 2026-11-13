import { prop } from '@typegoose/typegoose';
import { TimeStamps } from '@typegoose/typegoose/lib/defaultClasses';
import { Types } from 'mongoose';
import { Field, ID, ObjectType } from 'type-graphql';
import { PipelineMachineInfo } from '../../../core/pipeline/classes/PipelineMachineInfo';
import { ExperimentOptimization } from './ExperimentOptimization';

@ObjectType({ description: 'A classification experiment: a dataset and a graph of stages.' })
export class Experiment extends TimeStamps {
  @Field(() => ID, { description: 'Id of the experiment.' })
  _id!: Types.ObjectId;

  @prop({ type: () => Types.ObjectId, required: true, index: true })
  createdById!: Types.ObjectId;

  @Field({ description: 'Name of the experiment.' })
  @prop({ required: true, trim: true })
  name!: string;

  @Field({ nullable: true, description: 'Description.' })
  @prop({ trim: true })
  description?: string;

  @Field(() => ID, { nullable: true, description: 'Id of the attached dataset file, if any.' })
  @prop({ type: () => Types.ObjectId })
  fileId?: Types.ObjectId;

  @Field(() => [PipelineMachineInfo], {
    nullable: true,
    description: 'Machines that computed pipelines of the experiment, one per queue.',
  })
  @prop({ _id: false, type: () => [PipelineMachineInfo], default: [] })
  computationHosts?: PipelineMachineInfo[];

  @Field(() => ExperimentOptimization, {
    nullable: true,
    description: 'State and result of the optimization.',
  })
  @prop({ _id: false, type: () => ExperimentOptimization })
  optimization?: ExperimentOptimization;

  @Field(() => Date, { description: 'When the experiment was created.' })
  declare createdAt: Date;
}
