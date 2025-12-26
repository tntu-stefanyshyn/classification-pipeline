import { prop } from '@typegoose/typegoose';
import { TimeStamps } from '@typegoose/typegoose/lib/defaultClasses';
import { Types } from 'mongoose';
import { Field, ID, ObjectType } from 'type-graphql';

@ObjectType()
export class User extends TimeStamps {
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

  @Field(() => Date, { nullable: true })
  declare createdAt?: Date;

  @Field(() => Date, { nullable: true })
  declare updatedAt?: Date;
}
