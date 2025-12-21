import { Arg, Mutation, Resolver } from 'type-graphql';

import { AuthPayload } from '../classes/AuthPayload';
import { LoginInput } from '../classes/LoginInput';
import { RegisterInput } from '../classes/RegisterInput';
import { AuthService } from '../services/AuthService';

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
}
