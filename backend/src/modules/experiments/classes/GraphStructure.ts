import { prop } from '@typegoose/typegoose';
import { Types } from 'mongoose';
import { Field, ID, ObjectType } from 'type-graphql';
import { GraphNode } from './GraphNode';
import { TimeStamps } from '@typegoose/typegoose/lib/defaultClasses';
import { GraphStructureSettings } from './GraphStructureSettings';
import { ComputationMode } from './ComputationMode';

@ObjectType()
export class GraphStructure extends TimeStamps {
  @Field(() => ID)
  _id!: Types.ObjectId;

  @Field(() => ID)
  @prop({ required: true, unique: true, index: true })
  experimentId!: Types.ObjectId;

  @Field(() => [GraphNode])
  @prop({ type: () => [GraphNode], default: [] })
  nodes!: GraphNode[];

  @Field(() => GraphStructureSettings, { nullable: true })
  @prop({ _id: false, type: () => GraphStructureSettings, default: null })
  settings?: GraphStructureSettings | null;

  @Field(() => ComputationMode, { nullable: true })
  @prop({ enum: ComputationMode, type: () => String, default: ComputationMode.both })
  computationMode?: ComputationMode;

  @Field(() => Date)
  declare createdAt: Date;
}
