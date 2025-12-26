import { prop } from '@typegoose/typegoose';
import { Types } from 'mongoose';
import { Field, ID, ObjectType } from 'type-graphql';
import { ClassificationStage } from './ClassificationStage';
import { GraphNodeSetting } from './GraphNodeSetting';

@ObjectType()
export class GraphNode {
  @Field(() => ID)
  @prop({ required: true, type: () => Types.ObjectId })
  _id!: Types.ObjectId;

  @Field()
  @prop({ required: true, trim: true })
  label!: string;

  @Field(() => ClassificationStage)
  @prop({ required: true, enum: ClassificationStage, type: () => String })
  stage!: ClassificationStage;

  @Field()
  @prop({ required: true, trim: true })
  technology!: string;

  @Field(() => [GraphNodeSetting], { nullable: true })
  @prop({ type: () => [GraphNodeSetting], _id: false })
  settings?: GraphNodeSetting[];

  @Field()
  @prop({ required: true, trim: true })
  type!: string;

  @Field(() => ID, { nullable: true })
  @prop({ type: () => Types.ObjectId })
  parentId?: Types.ObjectId;
}
