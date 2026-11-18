import { Field, ObjectType } from 'type-graphql';

import { User } from '../../../core/user';

@ObjectType({
  description: 'Tokens and the user returned by `login`, `register` and `refreshSession`.',
})
export class AuthPayload {
  /** Short-lived access token (JWT) for the `Authorization` header. */
  @Field({
    description:
      'Access token (JWT) for the `Authorization: Bearer` header. It expires after `ACCESS_TOKEN_TTL`.',
  })
  token!: string;

  /** Opaque token for `refreshSession`; it is valid for one exchange only. */
  @Field({
    description:
      'Opaque token for `refreshSession` and `logout`. It can be used once; every refresh returns a new one.',
  })
  refreshToken!: string;

  @Field(() => User, { description: 'The signed-in user.' })
  user!: User;
}
