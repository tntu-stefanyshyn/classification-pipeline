import bcrypt from 'bcryptjs';
import { timingSafeEqual } from 'crypto';
import jwt, { JwtPayload } from 'jsonwebtoken';
import type { Request } from 'express';

import { config } from '../../../config/config';
import { User, UserModel } from '../../../core/user';
import { accessTokenTtlSeconds } from '../constants/token';
import { AuthPayload } from '../classes/AuthPayload';
import type { Principal } from '../classes/Principal';
import { LoginInput } from '../classes/LoginInput';
import { RegisterInput } from '../classes/RegisterInput';
import { AuthenticationError } from '../classes/AuthenticationError';
import { InvalidCredentialsError } from '../classes/InvalidCredentialsError';
import { SessionStore } from './SessionStore';

export class AuthFlow {
  private readonly sessions = new SessionStore();

  async register(input: RegisterInput): Promise<AuthPayload> {
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

    return this.startSession(user);
  }

  async login(input: LoginInput): Promise<AuthPayload> {
    const email = input.email.toLowerCase().trim();
    const user = await UserModel.findOne({ email });
    if (!user) {
      throw new InvalidCredentialsError();
    }

    const passwordValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordValid) {
      throw new InvalidCredentialsError();
    }

    return this.startSession(user);
  }

  /** Exchanges a refresh token for a new pair; the presented token stops working. */
  async refreshSession(refreshToken: string): Promise<AuthPayload> {
    const next = await this.sessions.rotate(refreshToken);
    const user = await UserModel.findById(next.userId);
    if (!user) {
      await this.sessions.revoke(next.refreshToken);
      throw AuthenticationError.sessionExpired();
    }
    return { token: this.buildToken(user), refreshToken: next.refreshToken, user };
  }

  /** Ends the session of the refresh token; an unknown token is ignored. */
  async logout(refreshToken: string): Promise<boolean> {
    await this.sessions.revoke(refreshToken);
    return true;
  }

  async me(req: Request): Promise<User> {
    // if (config.isDev) {
    //   return (await UserModel.findOne({
    //     email: 'ivan_stefanyshyn0707@tntu.edu.ua',
    //   }).lean()) as User;
    // }

    const token = this.extractToken(req);
    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
    } catch (error) {
      // Keeps the library message (`jwt expired`, `jwt malformed`) and adds the stable code.
      throw new AuthenticationError(error instanceof Error ? error.message : 'Invalid token');
    }

    const userId = payload.sub;
    if (!userId) {
      throw new AuthenticationError('Invalid token payload');
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      throw new AuthenticationError('User not found');
    }

    return user;
  }

  /** True when the request carries BACKEND_SERVICE_TOKEN (compute workers authenticate with it). */
  isService(req: Request): boolean {
    const expected = Buffer.from(config.backend.serviceToken);
    const provided = Buffer.from((req.headers?.authorization || '').replace('Bearer', '').trim());
    return (
      expected.length > 0 &&
      expected.length === provided.length &&
      timingSafeEqual(expected, provided)
    );
  }

  /** The service token if the request carries it, otherwise the user of the JWT. */
  async authenticate(req: Request): Promise<Principal> {
    if (this.isService(req)) return { kind: 'service' };
    const user = await this.me(req);
    return { kind: 'user', userId: user._id };
  }

  /** Guards worker-only operations: anything except BACKEND_SERVICE_TOKEN is rejected. */
  requireService(req: Request): void {
    if (!this.isService(req)) {
      throw new AuthenticationError();
    }
  }

  private async startSession(user: User): Promise<AuthPayload> {
    const refreshToken = await this.sessions.start(user._id);
    return { token: this.buildToken(user), refreshToken, user };
  }

  private buildToken(user: User): string {
    return jwt.sign({ sub: user._id.toString(), email: user.email }, config.jwtSecret, {
      expiresIn: accessTokenTtlSeconds(),
    });
  }

  private extractToken(req: Request): string {
    const header = req.headers.authorization || '';
    const token = header.replace('Bearer', '').trim();
    if (!token) {
      throw new AuthenticationError();
    }
    return token;
  }
}
