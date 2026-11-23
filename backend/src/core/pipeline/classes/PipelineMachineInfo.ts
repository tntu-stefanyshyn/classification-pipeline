import { prop } from '@typegoose/typegoose';
import { Field, Float, InputType, Int, ObjectType } from 'type-graphql';
import { ComputationQueue } from '../../../modules/computations/classes/ComputationQueue';

@ObjectType({ description: 'Description of the machine that runs a pipeline.' })
export class PipelineMachineInfo {
  @Field({
    nullable: true,
    description:
      'Host name. A `local` claim must send it: only one `local` run can be running per host name.',
  })
  @prop({ trim: true })
  hostname?: string;

  @Field({
    nullable: true,
    description: 'Operating system platform, for example `win32` or `linux`.',
  })
  @prop({ trim: true })
  platform?: string;

  @Field({ nullable: true, description: 'CPU architecture, for example `x64`.' })
  @prop({ trim: true })
  arch?: string;

  @Field({ nullable: true, description: 'Operating system release.' })
  @prop({ trim: true })
  release?: string;

  @Field({ nullable: true, description: 'CPU model.' })
  @prop({ trim: true })
  cpuModel?: string;

  @Field({ nullable: true, description: 'GPU model, if known.' })
  @prop({ trim: true })
  gpuModel?: string;

  @Field(() => Int, { nullable: true, description: 'Number of CPU cores.' })
  @prop({ min: 1 })
  cores?: number;

  @Field(() => Float, { nullable: true, description: 'Memory in gigabytes.' })
  @prop({ min: 0 })
  memoryGb?: number;

  @Field({ nullable: true, description: 'Version of the application or worker.' })
  @prop({ trim: true })
  appVersion?: string;

  @Field(() => ComputationQueue, { nullable: true, description: 'Queue the machine serves.' })
  @prop({ enum: ComputationQueue, type: () => String })
  queue?: ComputationQueue;

  @Field(() => Date, { nullable: true, description: 'When the machine last claimed a run.' })
  @prop()
  lastSeenAt?: Date;
}

@InputType({ description: 'Description of the machine that a worker sends when it claims a run.' })
export class PipelineMachineInfoInput {
  @Field({
    nullable: true,
    description:
      'Host name. A `local` claim must send it: only one `local` run can be running per host name.',
  })
  hostname?: string;

  @Field({
    nullable: true,
    description: 'Operating system platform, for example `win32` or `linux`.',
  })
  platform?: string;

  @Field({ nullable: true, description: 'CPU architecture, for example `x64`.' })
  arch?: string;

  @Field({ nullable: true, description: 'Operating system release.' })
  release?: string;

  @Field({ nullable: true, description: 'CPU model.' })
  cpuModel?: string;

  @Field({ nullable: true, description: 'GPU model, if known.' })
  gpuModel?: string;

  @Field(() => Int, { nullable: true, description: 'Number of CPU cores.' })
  cores?: number;

  @Field(() => Float, { nullable: true, description: 'Memory in gigabytes.' })
  memoryGb?: number;

  @Field({ nullable: true, description: 'Version of the application or worker.' })
  appVersion?: string;
}
