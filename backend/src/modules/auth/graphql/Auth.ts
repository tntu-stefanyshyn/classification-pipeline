import { Arg, Ctx, Mutation, Query, Resolver } from 'type-graphql';
import type { Request } from 'express';

import { AuthPayload } from '../classes/AuthPayload';
import { LoginInput } from '../classes/LoginInput';
import { RegisterInput } from '../classes/RegisterInput';
import { AuthFlow } from '../services/AuthFlow';
import { User } from '../../../core/user';

const authFlow = new AuthFlow();

@Resolver()
export class Auth {
  @Mutation(() => AuthPayload, {
    description:
      'Creates an account and signs the user in. Returns the access token, a refresh token and the user.',
  })
  async register(
    @Arg('input', { description: 'Email, password and optional name.' }) input: RegisterInput
  ): Promise<AuthPayload> {
    return authFlow.register(input);
  }

  @Mutation(() => AuthPayload, {
    description:
      'Signs a user in with email and password. A wrong email or password fails with the code `INVALID_CREDENTIALS`.',
  })
  async login(
    @Arg('input', { description: 'Email and password.' }) input: LoginInput
  ): Promise<AuthPayload> {
    return authFlow.login(input);
  }

  /**
   * Needs no access token: it is the way to get a new one after the old one expired. A client
   * sends the same `attemptId` when it repeats an exchange whose answer it did not receive.
   */
  @Mutation(() => AuthPayload, {
    description:
      'Exchanges a refresh token for a new access token and a new refresh token. Needs no access token; the used refresh token stops working. A refresh token that is presented twice ends the whole session.',
  })
  async refreshSession(
    @Arg('refreshToken', {
      description: 'The refresh token from the last `login`, `register` or `refreshSession`.',
    })
    refreshToken: string,
    @Arg('attemptId', () => String, {
      nullable: true,
      description:
        'Optional id of this exchange. Send the same value when repeating an exchange whose answer was lost, and the same new refresh token is returned.',
    })
    attemptId?: string | null
  ): Promise<AuthPayload> {
    return authFlow.refreshSession(refreshToken, attemptId);
  }

  @Mutation(() => Boolean, {
    description:
      'Ends the session of a refresh token. Returns `true` also for an unknown token, so it can be repeated safely.',
  })
  async logout(
    @Arg('refreshToken', { description: 'The refresh token of the session to end.' })
    refreshToken: string
  ): Promise<boolean> {
    return authFlow.logout(refreshToken);
  }

  @Query(() => User, { description: 'The user of the access token. Needs a signed-in user.' })
  async me(@Ctx('req') req: Request): Promise<User | null> {
    return authFlow.me(req);
  }
}
