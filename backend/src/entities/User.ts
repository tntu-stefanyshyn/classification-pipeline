import { getModelForClass, index, modelOptions, prop } from '@typegoose/typegoose';
import { Types } from 'mongoose';
import { Field, ID, ObjectType } from 'type-graphql';

@ObjectType()
@modelOptions({ schemaOptions: { timestamps: true } })
@index({ email: 1 }, { unique: true })
export class User {
  @Field(() => ID)
  _id!: Types.ObjectId;

  @Field()
  @prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @prop({ required: true })
  passwordHash!: string;

  @Field({ nullable: true })
  @prop({ trim: true })
  name?: string;

  @Field({ nullable: true })
  createdAt?: Date;

  @Field({ nullable: true })
  updatedAt?: Date;
}

export const UserModel = getModelForClass(User);
