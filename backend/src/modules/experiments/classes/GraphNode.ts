import { prop } from '@typegoose/typegoose';
import { Types } from 'mongoose';
import { Field, ID, ObjectType } from 'type-graphql';
import { ClassificationStage } from './ClassificationStage';
import { GraphNodeSetting } from './GraphNodeSetting';

@ObjectType({ description: 'A node of the graph: one technology at one stage.' })
export class GraphNode {
  @Field(() => ID, { description: 'Id of the node.' })
  @prop({ required: true, type: () => Types.ObjectId })
  _id!: Types.ObjectId;

  @Field({ description: 'Name shown for the node.' })
  @prop({ required: true, trim: true })
  label!: string;

  @Field(() => ClassificationStage, { description: 'Stage the node belongs to.' })
  @prop({ required: true, enum: ClassificationStage, type: () => String })
  stage!: ClassificationStage;

  @Field({ description: 'Name of the technology.' })
  @prop({ required: true, trim: true })
  technology!: string;

  @Field(() => [GraphNodeSetting], {
    nullable: true,
    description: 'Values of the technology settings.',
  })
  @prop({ type: () => [GraphNodeSetting], _id: false })
  settings?: GraphNodeSetting[];

  @Field({
    description: 'Kind of the node. Nodes made from technologies have the type `technology`.',
  })
  @prop({ required: true, trim: true })
  type!: string;

  @Field(() => ID, {
    nullable: true,
    description: 'Id of the parent node. A node without a parent starts a path.',
  })
  @prop({ type: () => Types.ObjectId })
  parentId?: Types.ObjectId;
}
