import { modelOptions, prop } from '@typegoose/typegoose';
import { Field, ID, Int, ObjectType } from 'type-graphql';

@ObjectType()
@modelOptions({ schemaOptions: { id: false, versionKey: false } })
export class UploadedFile {
  @Field(() => ID)
  @prop({ required: true, unique: true, trim: true })
  id!: string;

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
