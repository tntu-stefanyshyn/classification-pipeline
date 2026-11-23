import { index, prop } from '@typegoose/typegoose';
import { TimeStamps } from '@typegoose/typegoose/lib/defaultClasses';
import { Types } from 'mongoose';
import { Field, Float, ID, Int, ObjectType } from 'type-graphql';
import { ComputationQueue } from '../../../modules/computations/classes/ComputationQueue';
import { PipelineMachineInfo } from './PipelineMachineInfo';
import { ComputationResultPayload } from '../../../modules/computations/classes/ComputationResultPayload';
import { PipelineHistoryItem } from './PipelineHistoryItem';

// A run can be re-run once: the second of two simultaneous re-runs hits this index instead of
// creating a duplicate run of the same path.
@index({ rerunOf: 1 }, { unique: true, partialFilterExpression: { rerunOf: { $exists: true } } })
@ObjectType({
  description: "One run: the computation of one path of an experiment's graph in one queue.",
})
export class Pipeline extends TimeStamps {
  @Field(() => ID, { description: 'Id of the pipeline (run).' })
  _id!: Types.ObjectId;

  @Field(() => ID, { description: 'Id of the experiment the pipeline belongs to.' })
  @prop({ required: true, index: true, type: () => Types.ObjectId })
  experimentId!: Types.ObjectId;

  @Field(() => ID, { description: 'Id of the graph the path was taken from.' })
  @prop({ required: true, index: true, type: () => Types.ObjectId })
  graphStructureId!: Types.ObjectId;

  @Field(() => ComputationQueue, {
    description: 'Queue that serves the pipeline: `local` or `cloud`.',
  })
  @prop({ required: true, enum: ComputationQueue, type: () => String })
  queue!: ComputationQueue;

  @Field(() => [ID], {
    description: 'Ids of the graph nodes on the path, from the first stage to classification.',
  })
  @prop({ required: true, type: () => [Types.ObjectId] })
  pathNodeIds!: Types.ObjectId[];

  @Field(() => Float, {
    nullable: true,
    description:
      'Progress of the current run in percent (0 to 100); empty until a worker reports it.',
  })
  @prop({ min: 0, max: 100 })
  progress?: number;

  @Field({
    nullable: true,
    description:
      'Last message of the current run, for example "В черзі" or the error that ended it.',
  })
  @prop({ trim: true })
  statusMessage?: string;

  @Field(() => [PipelineHistoryItem], {
    description: 'Status changes and progress messages of the pipeline, oldest first.',
  })
  @prop({ _id: false, type: () => [PipelineHistoryItem], default: [] })
  history!: PipelineHistoryItem[];

  @Field(() => PipelineMachineInfo, {
    nullable: true,
    description: 'Machine that executes or executed the current run.',
  })
  @prop({ _id: false, type: () => PipelineMachineInfo })
  machineInfo?: PipelineMachineInfo;

  @Field(() => ComputationResultPayload, {
    nullable: true,
    description: 'Result of the completed run (metrics per cross-validation fold).',
  })
  @prop({ _id: false, type: () => ComputationResultPayload })
  computingResult?: ComputationResultPayload;

  @Field(() => [Float], {
    nullable: true,
    description: 'Scores calculated for this pipeline by the optimization.',
  })
  @prop({ type: () => [Number], default: [] })
  optimizationScores?: number[];

  @prop({ min: 0, default: 0 })
  priority?: number;

  /**
   * Execution fence: the number of the latest execution a claim started. It is raised before the
   * claim's status change, so reports carrying an older number are rejected by their update filter.
   */
  @Field(() => ID, {
    nullable: true,
    description:
      'Number of the current execution of the pipeline. Every claim by a worker starts a new execution, and workers must send it with every report.',
  })
  @prop({ type: () => Number })
  executionId?: number;

  /** Set by Stop/Pause before ending an execution; its job id is then recorded no more. */
  @prop({ type: () => Number })
  stoppedExecutionId?: number;

  @prop({ trim: true })
  cloudJobId?: string;

  /** The run this one re-runs. Unique, so one run cannot be re-run twice. */
  @prop({ type: () => Types.ObjectId })
  rerunOf?: Types.ObjectId;

  @Field(() => Date, { description: 'When the pipeline was created.' })
  declare createdAt: Date;

  @Field(() => Date, { description: 'When the pipeline was last changed.' })
  declare updatedAt: Date;
}
