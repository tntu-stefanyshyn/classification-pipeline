import { prop } from '@typegoose/typegoose';
import { TimeStamps } from '@typegoose/typegoose/lib/defaultClasses';
import { Types } from 'mongoose';
import { Field, ID, ObjectType } from 'type-graphql';
import { ComputationResultPayload } from './ComputationResultPayload';

@ObjectType()
export class ComputationResult extends TimeStamps {
  @Field(() => ID)
  _id!: Types.ObjectId;

  @Field(() => ID)
  @prop({ required: true, type: () => Types.ObjectId })
  pipelineId!: Types.ObjectId;

  @Field(() => ComputationResultPayload)
  @prop({ _id: false, required: true, type: () => ComputationResultPayload })
  payload!: ComputationResultPayload;

  @Field(() => Date)
  declare createdAt: Date;
}
