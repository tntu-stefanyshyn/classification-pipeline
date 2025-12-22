import { Arg, Ctx, Mutation, Query, Resolver } from 'type-graphql';
import type { Request } from 'express';

import { AuthPayload } from '../classes/AuthPayload';
import { LoginInput } from '../classes/LoginInput';
import { RegisterInput } from '../classes/RegisterInput';
import { AuthService } from '../services/AuthService';
import { User, UserModel } from '../../../core/user';
import { config } from '../../../config/config';

const authService = new AuthService();

@Resolver()
export class AuthResolver {
  @Mutation(() => AuthPayload)
  async register(@Arg('input') input: RegisterInput): Promise<AuthPayload> {
    return authService.register(input);
  }

  @Mutation(() => AuthPayload)
  async login(@Arg('input') input: LoginInput): Promise<AuthPayload> {
    return authService.login(input);
  }

  @Query(() => User)
  async me(@Ctx('req') req: Request): Promise<User | null> {
    if (config.isDev) {
      return UserModel.findOne();
    }
    return authService.me(req);
  }
}
