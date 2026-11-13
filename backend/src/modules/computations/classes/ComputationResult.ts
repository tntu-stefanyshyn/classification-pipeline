import { prop } from '@typegoose/typegoose';
import { TimeStamps } from '@typegoose/typegoose/lib/defaultClasses';
import { Types } from 'mongoose';
import { Field, ID, ObjectType } from 'type-graphql';
import { ComputationResultPayload } from './ComputationResultPayload';

@ObjectType({ description: 'A stored computation result of a pipeline.' })
export class ComputationResult extends TimeStamps {
  @Field(() => ID, { description: 'Id of the result.' })
  _id!: Types.ObjectId;

  @Field(() => ID, { description: 'Id of the pipeline.' })
  @prop({ required: true, type: () => Types.ObjectId })
  pipelineId!: Types.ObjectId;

  @Field(() => ComputationResultPayload, { description: 'The result data.' })
  @prop({ _id: false, required: true, type: () => ComputationResultPayload })
  payload!: ComputationResultPayload;

  @Field(() => Date, { description: 'When the result was stored.' })
  declare createdAt: Date;
}
