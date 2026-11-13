import { prop } from '@typegoose/typegoose';
import { TimeStamps } from '@typegoose/typegoose/lib/defaultClasses';
import { Types } from 'mongoose';
import { Field, ID, ObjectType } from 'type-graphql';

@ObjectType({ description: 'A registered user.' })
export class User extends TimeStamps {
  @Field(() => ID, { description: 'Id of the user.' })
  _id!: Types.ObjectId;

  @Field({ description: 'Email address, unique and stored in lower case.' })
  @prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @prop({ required: true })
  passwordHash!: string;

  @Field({ nullable: true, description: 'Display name.' })
  @prop({ trim: true })
  name?: string;

  @Field(() => Date, { nullable: true, description: 'When the account was created.' })
  declare createdAt?: Date;

  @Field(() => Date, { nullable: true, description: 'When the account was last changed.' })
  declare updatedAt?: Date;
}
