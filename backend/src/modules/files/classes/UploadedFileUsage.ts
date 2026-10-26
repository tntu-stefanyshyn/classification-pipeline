import { Types } from 'mongoose';
import { Field, ID, Int, ObjectType } from 'type-graphql';
import { ExperimentStatus } from '../../experiments/classes/ExperimentStatus';

@ObjectType()
export class UploadedFileUsageExperiment {
  @Field(() => ID)
  _id!: Types.ObjectId;

  @Field()
  name!: string;

  @Field(() => ExperimentStatus)
  status!: ExperimentStatus;

  // Computing or optimizing: the file cannot be detached now.
  @Field()
  blocking!: boolean;
}

@ObjectType()
export class UploadedFileUsage {
  // Only the file owner's experiments are listed by name.
  @Field(() => [UploadedFileUsageExperiment])
  experiments!: UploadedFileUsageExperiment[];

  // Other users' experiments referencing the file; detached together with the owner's.
  @Field(() => Int)
  otherExperimentsCount!: number;

  @Field()
  blocked!: boolean;
}
