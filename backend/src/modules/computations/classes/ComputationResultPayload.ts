import { prop } from '@typegoose/typegoose';
import { Field, Float, InputType, Int, ObjectType } from 'type-graphql';

@ObjectType({
  description: 'Result of a completed run. Lists have one value per cross-validation fold.',
})
export class ComputationResultPayload {
  @Field(() => [Float], { description: 'Accuracy of each fold, from 0 to 1.' })
  @prop({ type: () => [Number], required: true })
  accuracyScores!: number[];

  @Field(() => [Float], { description: 'Weighted F1 score of each fold, from 0 to 1.' })
  @prop({ type: () => [Number], required: true })
  f1Scores!: number[];

  @Field(() => [Float], { description: 'ROC AUC of each fold, from 0 to 1.' })
  @prop({ type: () => [Number], required: true })
  rocAucScores!: number[];

  @Field(() => [Float], {
    nullable: true,
    description:
      'Length of the vector of the three metrics of each fold (an intermediate value for the optimization).',
  })
  @prop({ type: () => [Number], default: [] })
  optimizationIntermediateScores?: number[];

  @Field(() => Int, { description: 'Number of rows in the dataset.' })
  @prop({ required: true })
  sampleCount!: number;

  @Field(() => Float, { description: 'Duration of the whole run in seconds.' })
  @prop({ required: true })
  duration!: number;

  @Field(() => Float, {
    nullable: true,
    description:
      'Seconds spent in the cross-validation folds (training and prediction), without the time spent on reading and preparing the data.',
  })
  @prop()
  cvDuration?: number;

  @Field(() => Int, {
    nullable: true,
    description: 'Number of cross-validation folds that were completed.',
  })
  @prop()
  completedFoldCount?: number;

  @Field(() => [[Int]], {
    nullable: true,
    description:
      'A single confusion matrix. The compute handler sends `confusionMatrixes` instead.',
  })
  @prop({ type: () => [[Number]] })
  confusionMatrix?: number[][];

  @Field(() => [[[Int]]], {
    nullable: true,
    description: 'Confusion matrix of each fold. Rows and columns follow `channelNames`.',
  })
  @prop({ type: () => [[[Number]]], default: [] })
  confusionMatrixes?: number[][][];

  @Field(() => [String], {
    description:
      'The class labels found in the dataset, in the order used by the confusion matrices.',
  })
  @prop({ type: () => [String], required: true })
  channelNames!: string[];

  @Field(() => [Int], {
    nullable: true,
    description: 'Number of rows used for prediction in each fold.',
  })
  @prop({ type: () => [Number], default: [] })
  predictionSampleCounts?: number[];

  @Field(() => Int, {
    nullable: true,
    description: 'Number of rows used for prediction in the first fold.',
  })
  @prop()
  predictionSampleCount?: number;

  @Field(() => Float, {
    nullable: true,
    description: 'Percentage of the data used for prediction, from the graph settings.',
  })
  @prop()
  predictionDataPercent?: number;

  @Field(() => String, {
    nullable: true,
    description:
      'JSON text that describes how the EEG data were processed: the splitter and, for each fold, the processing steps. Empty for runs that did not use it.',
  })
  @prop()
  eegProcessing?: string;
}

@InputType({
  description:
    'Result of a completed run, sent by the worker. Lists have one value per cross-validation fold.',
})
export class ComputationResultPayloadInput {
  @Field(() => [Float], { description: 'Accuracy of each fold, from 0 to 1.' })
  accuracyScores!: number[];

  @Field(() => [Float], { description: 'Weighted F1 score of each fold, from 0 to 1.' })
  f1Scores!: number[];

  @Field(() => [Float], { description: 'ROC AUC of each fold, from 0 to 1.' })
  rocAucScores!: number[];

  @Field(() => [Float], {
    nullable: true,
    description:
      'Length of the vector of the three metrics of each fold (an intermediate value for the optimization).',
  })
  optimizationIntermediateScores?: number[];

  @Field(() => Int, { description: 'Number of rows in the dataset.' })
  sampleCount!: number;

  @Field(() => Float, { description: 'Duration of the whole run in seconds.' })
  duration!: number;

  @Field(() => Float, {
    nullable: true,
    description:
      'Seconds spent in the cross-validation folds (training and prediction), without the time spent on reading and preparing the data.',
  })
  cvDuration?: number;

  @Field(() => Int, {
    nullable: true,
    description: 'Number of cross-validation folds that were completed.',
  })
  completedFoldCount?: number;

  @Field(() => [[[Int]]], {
    description: 'Confusion matrix of each fold. Rows and columns follow `channelNames`.',
  })
  confusionMatrixes!: number[][][];

  @Field(() => [String], {
    description:
      'The class labels found in the dataset, in the order used by the confusion matrices.',
  })
  channelNames!: string[];

  @Field(() => [Int], {
    nullable: true,
    description: 'Number of rows used for prediction in each fold.',
  })
  predictionSampleCounts?: number[];

  @Field(() => Int, {
    nullable: true,
    description: 'Number of rows used for prediction in the first fold.',
  })
  predictionSampleCount?: number;

  @Field(() => Float, {
    nullable: true,
    description: 'Percentage of the data used for prediction, from the graph settings.',
  })
  predictionDataPercent?: number;

  @Field(() => String, {
    nullable: true,
    description:
      'JSON text that describes how the EEG data were processed: the splitter and, for each fold, the processing steps. Empty for runs that did not use it.',
  })
  eegProcessing?: string;
}
