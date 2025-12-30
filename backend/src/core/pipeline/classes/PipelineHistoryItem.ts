import { prop } from '@typegoose/typegoose';
import { Field, ObjectType } from 'type-graphql';

@ObjectType()
export class PipelineHistoryItem {
  @Field()
  @prop({ required: true, trim: true })
  message!: string;

  @Field()
  @prop({ required: true })
  createdAt!: Date;
}
