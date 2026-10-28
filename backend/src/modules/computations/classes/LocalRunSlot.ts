import { prop } from '@typegoose/typegoose';
import { Types } from 'mongoose';

/** The one local run a machine may hold; `_id` is the machine's hostname. */
export class LocalRunSlot {
  @prop({ required: true, type: () => String })
  _id!: string;

  @prop({ type: () => Types.ObjectId, default: null })
  pipelineId?: Types.ObjectId | null;

  @prop({ type: () => Date })
  reservedAt?: Date;
}
