import { prop } from '@typegoose/typegoose';
import { Field, ObjectType } from 'type-graphql';
import { PipelineStatus } from '../enums';

@ObjectType()
export class PipelineHistoryItem {
  @Field()
  @prop({ required: false, trim: true })
  message?: string;

  @Field()
  @prop({ required: false })
  status?: PipelineStatus;

  @Field()
  @prop({ required: true })
  createdAt!: Date;
}
