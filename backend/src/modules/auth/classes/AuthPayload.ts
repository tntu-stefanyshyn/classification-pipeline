import { Field, ObjectType } from 'type-graphql';

import { User } from '../../../core/user';

@ObjectType()
export class AuthPayload {
  /** Short-lived access token (JWT) for the `Authorization` header. */
  @Field()
  token!: string;

  /** Opaque token for `refreshSession`; it is valid for one exchange only. */
  @Field()
  refreshToken!: string;

  @Field(() => User)
  user!: User;
}
