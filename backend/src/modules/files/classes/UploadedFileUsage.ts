import { Types } from 'mongoose';
import { Field, ID, Int, ObjectType } from 'type-graphql';
import { ExperimentStatus } from '../../experiments/classes/ExperimentStatus';

@ObjectType({ description: 'An experiment of the caller that uses a file.' })
export class UploadedFileUsageExperiment {
  @Field(() => ID, { description: 'Id of the experiment.' })
  _id!: Types.ObjectId;

  @Field({ description: 'Name of the experiment.' })
  name!: string;

  @Field(() => ExperimentStatus, { description: 'Status of the experiment.' })
  status!: ExperimentStatus;

  // Computing or optimizing: the file cannot be detached now.
  @Field({
    description:
      'True while the experiment is `computing` or `optimization`: the file cannot be deleted then.',
  })
  blocking!: boolean;
}

@ObjectType({ description: 'Where a file is used, and whether it can be deleted now.' })
export class UploadedFileUsage {
  // Only the file owner's experiments are listed by name.
  @Field(() => [UploadedFileUsageExperiment], {
    description:
      "The caller's experiments that use the file. Deleting the file detaches it from them.",
  })
  experiments!: UploadedFileUsageExperiment[];

  // Other users' experiments referencing the file; detached together with the owner's.
  @Field(() => Int, {
    description: 'How many experiments of other users use the file. They are only counted.',
  })
  otherExperimentsCount!: number;

  @Field({
    description:
      'True if any experiment that uses the file is computing or optimizing, so deletion is refused.',
  })
  blocked!: boolean;
}
