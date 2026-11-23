import { prop } from '@typegoose/typegoose';
import { Types } from 'mongoose';
import { Field, ID, ObjectType } from 'type-graphql';
import { GraphNode } from './GraphNode';
import { TimeStamps } from '@typegoose/typegoose/lib/defaultClasses';
import { GraphStructureSettings } from './GraphStructureSettings';
import { ComputationMode } from './ComputationMode';

@ObjectType({ description: 'The graph of an experiment with its settings.' })
export class GraphStructure extends TimeStamps {
  @Field(() => ID, { description: 'Id of the graph.' })
  _id!: Types.ObjectId;

  @Field(() => ID, { description: 'Id of the experiment.' })
  @prop({ required: true, unique: true, index: true })
  experimentId!: Types.ObjectId;

  @Field(() => [GraphNode], { description: 'The nodes. Edges are given by `parentId`.' })
  @prop({ type: () => [GraphNode], default: [] })
  nodes!: GraphNode[];

  @Field(() => GraphStructureSettings, {
    nullable: true,
    description: 'Computation settings; empty until they are saved.',
  })
  @prop({ _id: false, type: () => GraphStructureSettings, default: null })
  settings?: GraphStructureSettings | null;

  @Field(() => ComputationMode, { nullable: true, description: 'Which queues the graph allows.' })
  @prop({ enum: ComputationMode, type: () => String, default: ComputationMode.both })
  computationMode?: ComputationMode;

  @Field(() => Date, { description: 'When the graph was created.' })
  declare createdAt: Date;
}
