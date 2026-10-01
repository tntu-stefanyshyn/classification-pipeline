import bcrypt from 'bcryptjs';
import jwt, { JwtPayload } from 'jsonwebtoken';
import type { Request } from 'express';

import { config } from '../../../config/config';
import { User, UserModel } from '../../../core/user';
import { TOKEN_TTL } from '../constants/token';
import { AuthPayload } from '../classes/AuthPayload';
import { LoginInput } from '../classes/LoginInput';
import { RegisterInput } from '../classes/RegisterInput';

export class AuthFlow {
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

    const token = this.buildToken(user);
    return { token, user };
  }

  async login(input: LoginInput): Promise<AuthPayload> {
    const email = input.email.toLowerCase().trim();
    const user = await UserModel.findOne({ email });
    if (!user) {
      throw new Error('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordValid) {
      throw new Error('Invalid credentials');
    }

    const token = this.buildToken(user);
    return { token, user };
  }

  async me(req: Request): Promise<User> {
    if (config.isDev) {
      return (await UserModel.findOne({
        email: 'ivan_stefanyshyn0707@tntu.edu.ua',
      }).lean()) as User;
    }

    const token = this.extractToken(req);
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;

    const userId = payload.sub;
    if (!userId) {
      throw new Error('Invalid token payload');
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }

  private buildToken(user: User): string {
    return jwt.sign({ sub: user._id.toString(), email: user.email }, config.jwtSecret, {
      expiresIn: TOKEN_TTL,
    });
  }

  private extractToken(req: Request): string {
    const header = req.headers.authorization || '';
    const token = header.replace('Bearer', '').trim();
    if (!token) {
      throw new Error('Not authenticated');
    }
    return token;
  }
}
