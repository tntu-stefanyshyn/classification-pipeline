import { prop } from '@typegoose/typegoose';
import { TimeStamps } from '@typegoose/typegoose/lib/defaultClasses';
import { Types } from 'mongoose';

export class ComputationResult extends TimeStamps {
  @prop({ required: true, index: true, type: () => Types.ObjectId })
  runId!: Types.ObjectId;

  @prop({ required: true, index: true, type: () => Types.ObjectId })
  experimentId!: Types.ObjectId;

  @prop({ required: true, type: () => [Types.ObjectId] })
  pathNodeIds!: Types.ObjectId[];

  @prop({ type: () => Object, default: {} })
  payload!: Record<string, unknown>;
}
