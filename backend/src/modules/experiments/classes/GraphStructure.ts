import { modelOptions, prop } from '@typegoose/typegoose';
import { Types } from 'mongoose';
import { Field, ID, ObjectType } from 'type-graphql';
import { GraphNode } from './GraphNode';
import { TimeStamps } from '@typegoose/typegoose/lib/defaultClasses';

@ObjectType()
@modelOptions({ schemaOptions: { id: false, versionKey: false, collection: 'graph_structures' } })
export class GraphStructure extends TimeStamps {
  @Field(() => ID)
  _id!: Types.ObjectId;

  @Field(() => ID)
  @prop({ required: true, unique: true, index: true })
  experimentId!: Types.ObjectId;

  @Field(() => [GraphNode])
  @prop({ type: () => [GraphNode], default: [] })
  nodes!: GraphNode[];

  @Field(() => Date)
  declare createdAt: Date;
}
