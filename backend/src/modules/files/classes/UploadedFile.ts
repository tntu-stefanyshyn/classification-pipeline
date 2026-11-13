import { prop } from '@typegoose/typegoose';
import { Types } from 'mongoose';
import { Field, ID, Int, ObjectType } from 'type-graphql';

@ObjectType({ description: 'A dataset file stored in S3.' })
export class UploadedFile {
  @Field(() => ID, { description: 'Id of the file.' })
  _id!: Types.ObjectId;

  @Field({ description: 'Original file name.' })
  @prop({ required: true, trim: true })
  filename!: string;

  @Field(() => Int, { description: 'Size in megabytes.' })
  @prop({ required: true, min: 1 })
  sizeMb!: number;

  @Field({ description: 'Status text of the file.' })
  @prop({ required: true, trim: true, default: 'uploaded' })
  status!: string;

  @Field(() => Date, { description: 'When the file was registered.' })
  @prop({ required: true, default: Date.now })
  uploadedAt!: Date;

  @Field({ nullable: true, description: 'Name of the user who uploaded it.' })
  @prop({ trim: true })
  uploadedByName?: string;

  @prop({ type: () => Types.ObjectId })
  uploadedById?: Types.ObjectId;

  @prop({ required: true, trim: true })
  storageKey!: string;

  // Lease of the deletion in progress; experiments cannot attach a file marked this way.
  @prop()
  deletingAt?: Date;

  // Set once a deletion has passed its point of no return; never cleared.
  @prop()
  deleteCommittedAt?: Date;
}
