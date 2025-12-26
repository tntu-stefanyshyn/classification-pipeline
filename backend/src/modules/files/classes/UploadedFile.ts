import { prop } from '@typegoose/typegoose';
import { Types } from 'mongoose';
import { Field, ID, Int, ObjectType } from 'type-graphql';

@ObjectType()
export class UploadedFile {
  @Field(() => ID)
  _id!: Types.ObjectId;

  @Field()
  @prop({ required: true, trim: true })
  filename!: string;

  @Field(() => Int)
  @prop({ required: true, min: 1 })
  sizeMb!: number;

  @Field()
  @prop({ required: true, trim: true, default: 'uploaded' })
  status!: string;

  @Field(() => Date)
  @prop({ required: true, default: Date.now })
  uploadedAt!: Date;

  @prop({ required: true, trim: true })
  storageKey!: string;
}
