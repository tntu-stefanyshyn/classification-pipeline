import { prop } from '@typegoose/typegoose';
import { Field, ObjectType } from 'type-graphql';
import { OptimizationStatus } from './OptimizationStatus';

@ObjectType()
export class OptimizationHistoryItem {
  @Field(() => Date)
  @prop({ default: () => new Date() })
  createdAt!: Date;

  @Field({ nullable: true })
  @prop({ trim: true })
  message?: string;

  @Field(() => OptimizationStatus, { nullable: true })
  @prop({ enum: OptimizationStatus, type: () => String })
  status?: OptimizationStatus;
}
