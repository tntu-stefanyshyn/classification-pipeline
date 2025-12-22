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
  @Mutation(() => AuthPayload)
  async register(@Arg('input') input: RegisterInput): Promise<AuthPayload> {
    return authFlow.register(input);
  }

  @Mutation(() => AuthPayload)
  async login(@Arg('input') input: LoginInput): Promise<AuthPayload> {
    return authFlow.login(input);
  }

  @Query(() => User)
  async me(@Ctx('req') req: Request): Promise<User | null> {
    return authFlow.me(req);
  }
}
