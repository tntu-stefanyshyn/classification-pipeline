import { prop } from '@typegoose/typegoose';
import { Field, ObjectType } from 'type-graphql';
import { OptimizationStatus } from './OptimizationStatus';

@ObjectType({ description: 'One entry of the optimization history.' })
export class OptimizationHistoryItem {
  @Field(() => Date, { description: 'When the entry was written.' })
  @prop({ default: () => new Date() })
  createdAt!: Date;

  @Field({ nullable: true, description: 'Text of the entry.' })
  @prop({ trim: true })
  message?: string;

  @Field(() => OptimizationStatus, {
    nullable: true,
    description: 'Status of the optimization when the entry was written.',
  })
  @prop({ enum: OptimizationStatus, type: () => String })
  status?: OptimizationStatus;
}
