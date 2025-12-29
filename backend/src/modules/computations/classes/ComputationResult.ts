import { prop } from '@typegoose/typegoose';
import { TimeStamps } from '@typegoose/typegoose/lib/defaultClasses';
import { Types } from 'mongoose';
import { Field, Float, ID, Int, ObjectType } from 'type-graphql';

@ObjectType()
export class ClassificationMetric {
  @Field()
  @prop({ required: true, trim: true })
  label!: string;

  @Field()
  @prop({ required: true })
  precision!: number;

  @Field()
  @prop({ required: true })
  recall!: number;

  @Field()
  @prop({ required: true })
  f1Score!: number;

  @Field()
  @prop({ required: true })
  support!: number;
}

@ObjectType()
export class ComputationResultPayload {
  @Field({ nullable: true })
  @prop()
  accuracy?: number;

  @Field(() => [Float], { nullable: true })
  @prop({ type: () => [Number], default: [] })
  accuracyScores?: number[];

  @Field(() => [Float], { nullable: true })
  @prop({ type: () => [Number], default: [] })
  f1Scores?: number[];

  @Field(() => [Float], { nullable: true })
  @prop({ type: () => [Number], default: [] })
  rocAucScores?: number[];

  @Field(() => ClassificationMetric, { nullable: true })
  @prop({ _id: false, type: () => ClassificationMetric })
  macroAvg?: ClassificationMetric;

  @Field(() => ClassificationMetric, { nullable: true })
  @prop({ _id: false, type: () => ClassificationMetric })
  weightedAvg?: ClassificationMetric;

  @Field(() => [ClassificationMetric], { nullable: true })
  @prop({ _id: false, type: () => [ClassificationMetric], default: [] })
  classes?: ClassificationMetric[];

  @Field(() => Int, { nullable: true })
  @prop()
  sampleCount?: number;

  @Field(() => Float, { nullable: true })
  @prop()
  durationSeconds?: number;

  @Field(() => [[Int]], { nullable: true })
  @prop({ type: () => [[Number]], default: [] })
  confusionMatrix?: number[][];

  @Field(() => [String], { nullable: true })
  @prop({ type: () => [String], default: [] })
  classLabels?: string[];

  @Field(() => Int, { nullable: true })
  @prop()
  classCount?: number;

  @Field({ nullable: true })
  @prop()
  pathLength?: number;

  @Field(() => [String], { nullable: true })
  @prop({ type: () => [String], default: [] })
  nodes?: string[];

  @Field({ nullable: true })
  @prop()
  completedAt?: string;
}

@ObjectType()
export class ComputationResult extends TimeStamps {
  @Field(() => ID)
  _id!: Types.ObjectId;

  @Field(() => ID)
  @prop({ required: true, index: true, type: () => Types.ObjectId })
  runId!: Types.ObjectId;

  @Field(() => ID)
  @prop({ required: true, index: true, type: () => Types.ObjectId })
  experimentId!: Types.ObjectId;

  @Field(() => [ID])
  @prop({ required: true, type: () => [Types.ObjectId] })
  pathNodeIds!: Types.ObjectId[];

  @Field({ nullable: true })
  @prop({ trim: true })
  payloadJson?: string;

  @Field(() => ComputationResultPayload, { nullable: true })
  @prop({ _id: false, type: () => ComputationResultPayload })
  payload?: ComputationResultPayload;

  @Field(() => Date)
  declare createdAt: Date;
}
