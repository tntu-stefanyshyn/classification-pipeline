import { Arg, Field, InputType, Mutation, ObjectType, Resolver } from 'type-graphql';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

import { User, UserModel } from '../entities/User';
import { config } from '../config/config';

const TOKEN_TTL = '7d';

@ObjectType()
class AuthPayload {
  @Field()
  token!: string;

  @Field(() => User)
  user!: User;
}

@InputType()
class LoginInput {
  @Field()
  email!: string;

  @Field()
  password!: string;
}

@InputType()
class RegisterInput {
  @Field()
  email!: string;

  @Field()
  password!: string;

  @Field({ nullable: true })
  name?: string;
}

function buildToken(user: User): string {
  return jwt.sign({ sub: user.id, email: user.email }, config.jwtSecret, {
    expiresIn: TOKEN_TTL,
  });
}

function assertDbConnected() {
  if (mongoose.connection.readyState !== 1) {
    throw new Error('Database is not connected. Set MONGODB_URI and restart the server.');
  }
}

@Resolver()
export class AuthResolver {
  @Mutation(() => AuthPayload)
  async register(@Arg('input') input: RegisterInput): Promise<AuthPayload> {
    assertDbConnected();

    const email = input.email.toLowerCase().trim();
    const existing = await UserModel.findOne({ email });
    if (existing) {
      throw new Error('User already exists');
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await UserModel.create({
      email,
      passwordHash,
      name: input.name?.trim(),
    });

    const token = buildToken(user);
    return { token, user };
  }

  @Mutation(() => AuthPayload)
  async login(@Arg('input') input: LoginInput): Promise<AuthPayload> {
    assertDbConnected();

    const email = input.email.toLowerCase().trim();
    const user = await UserModel.findOne({ email });
    if (!user) {
      throw new Error('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordValid) {
      throw new Error('Invalid credentials');
    }

    const token = buildToken(user);
    return { token, user };
  }
}
