import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

import { config } from '../../../config/config';
import { User, UserModel } from '../../../core/user';
import { TOKEN_TTL } from '../constants/token';
import { AuthPayload } from '../classes/AuthPayload';
import { LoginInput } from '../classes/LoginInput';
import { RegisterInput } from '../classes/RegisterInput';

export class AuthService {
  async register(input: RegisterInput): Promise<AuthPayload> {
    this.assertDbConnected();

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
    this.assertDbConnected();

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

  private buildToken(user: User): string {
    return jwt.sign({ sub: user._id.toString(), email: user.email }, config.jwtSecret, {
      expiresIn: TOKEN_TTL,
    });
  }

  private assertDbConnected() {
    if (mongoose.connection.readyState !== 1) {
      throw new Error('Database is not connected. Set MONGODB_URI and restart the server.');
    }
  }
}
