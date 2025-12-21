import { Field, ObjectType } from 'type-graphql';

import { User } from '../../../core/user';

@ObjectType()
export class AuthPayload {
  @Field()
  token!: string;

  @Field(() => User)
  user!: User;
}
