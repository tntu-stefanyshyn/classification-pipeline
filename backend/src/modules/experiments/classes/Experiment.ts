import { modelOptions, prop } from '@typegoose/typegoose';
import mongoose from 'mongoose';
import { Field, ID, Int, ObjectType } from 'type-graphql';
import { GraphStructure } from './GraphStructure';

@ObjectType()
@modelOptions({ schemaOptions: { id: false, versionKey: false } })
export class Experiment {
  @Field(() => ID)
  @prop({ required: true, unique: true, trim: true })
  id!: string;

  @Field()
  @prop({ required: true, trim: true })
  name!: string;

  @Field({ nullable: true })
  @prop({ trim: true })
  description?: string;

  @Field()
  @prop({ required: true, trim: true, default: 'queued' })
  status!: string;

  @Field(() => Int)
  @prop({ required: true, min: 0, default: 0 })
  runs!: number;

  @Field(() => Date)
  @prop({ required: true, default: Date.now })
  createdAt!: Date;

  @Field({ nullable: true })
  @prop({ trim: true })
  fileName?: string;

  @Field(() => GraphStructure, { nullable: true })
  @prop({ type: () => mongoose.Schema.Types.Mixed, _id: false })
  graph?: GraphStructure;
}
