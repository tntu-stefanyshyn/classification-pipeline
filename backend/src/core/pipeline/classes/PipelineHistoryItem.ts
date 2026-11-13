import { prop } from '@typegoose/typegoose';
import { Field, ObjectType } from 'type-graphql';
import { PipelineStatus } from '../enums';

@ObjectType({
  description: 'One entry of the pipeline history: a status change or a progress message.',
})
export class PipelineHistoryItem {
  @Field({ description: 'Text of the entry.' })
  @prop({ required: false, trim: true })
  message?: string;

  @Field(() => PipelineStatus, {
    description: 'Status of the pipeline when the entry was written.',
  })
  @prop({ required: false, enum: PipelineStatus, type: () => String })
  status?: PipelineStatus;

  @Field({ description: 'When the entry was written.' })
  @prop({ required: true })
  createdAt!: Date;
}
