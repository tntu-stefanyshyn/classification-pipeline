import { prop } from '@typegoose/typegoose';
import { Field, Float, InputType, Int, ObjectType } from 'type-graphql';

@ObjectType()
export class ComputationResultPayload {
  @Field(() => [Float])
  @prop({ type: () => [Number], required: true })
  accuracyScores!: number[];

  @Field(() => [Float])
  @prop({ type: () => [Number], required: true })
  f1Scores!: number[];

  @Field(() => [Float])
  @prop({ type: () => [Number], required: true })
  rocAucScores!: number[];

  @Field(() => Int)
  @prop({ required: true })
  sampleCount!: number;

  @Field(() => Float)
  @prop({ required: true })
  duration!: number;

  @Field(() => [[Int]], { nullable: true })
  @prop({ type: () => [[Number]] })
  confusionMatrix?: number[][];

  @Field(() => [[[Int]]], { nullable: true })
  @prop({ type: () => [[[Number]]], default: [] })
  confusionMatrixes?: number[][][];

  @Field(() => [String])
  @prop({ type: () => [String], required: true })
  channelNames!: string[];

  @Field(() => [Int], { nullable: true })
  @prop({ type: () => [Number], default: [] })
  predictionSampleCounts?: number[];

  @Field(() => Int, { nullable: true })
  @prop()
  predictionSampleCount?: number;

  @Field(() => Float, { nullable: true })
  @prop()
  predictionDataPercent?: number;
}

@InputType()
export class ComputationResultPayloadInput {
  @Field(() => [Float])
  accuracyScores!: number[];

  @Field(() => [Float])
  f1Scores!: number[];

  @Field(() => [Float])
  rocAucScores!: number[];

  @Field(() => Int)
  sampleCount!: number;

  @Field(() => Float)
  duration!: number;

  @Field(() => [[[Int]]])
  confusionMatrixes!: number[][][];

  @Field(() => [String])
  channelNames!: string[];

  @Field(() => [Int], { nullable: true })
  predictionSampleCounts?: number[];

  @Field(() => Int, { nullable: true })
  predictionSampleCount?: number;

  @Field(() => Float, { nullable: true })
  predictionDataPercent?: number;
}
