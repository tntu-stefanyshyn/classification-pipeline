import { prop } from '@typegoose/typegoose';
import { Field, Float, InputType, Int, ObjectType } from 'type-graphql';
import { ComputationQueue } from './ComputationQueue';

@ObjectType()
export class ComputationMachineInfo {
  @Field({ nullable: true })
  @prop({ trim: true })
  hostname?: string;

  @Field({ nullable: true })
  @prop({ trim: true })
  platform?: string;

  @Field({ nullable: true })
  @prop({ trim: true })
  arch?: string;

  @Field({ nullable: true })
  @prop({ trim: true })
  release?: string;

  @Field({ nullable: true })
  @prop({ trim: true })
  cpuModel?: string;

  @Field(() => Int, { nullable: true })
  @prop({ min: 1 })
  cores?: number;

  @Field(() => Float, { nullable: true })
  @prop({ min: 0 })
  memoryGb?: number;

  @Field({ nullable: true })
  @prop({ trim: true })
  appVersion?: string;

  @Field(() => ComputationQueue, { nullable: true })
  @prop({ enum: ComputationQueue, type: () => String })
  queue?: ComputationQueue;

  @Field(() => Date, { nullable: true })
  @prop()
  lastSeenAt?: Date;
}

@InputType()
export class ComputationMachineInfoInput {
  @Field({ nullable: true })
  hostname?: string;

  @Field({ nullable: true })
  platform?: string;

  @Field({ nullable: true })
  arch?: string;

  @Field({ nullable: true })
  release?: string;

  @Field({ nullable: true })
  cpuModel?: string;

  @Field(() => Int, { nullable: true })
  cores?: number;

  @Field(() => Float, { nullable: true })
  memoryGb?: number;

  @Field({ nullable: true })
  appVersion?: string;
}
