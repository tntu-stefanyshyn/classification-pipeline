import { createHash, randomBytes, randomUUID } from 'crypto';
import { Types } from 'mongoose';

import { refreshTokenTtlSeconds } from '../constants/token';
import { sessionExpired } from '../errors';
import { RefreshTokenModel } from '../models/RefreshTokenModel';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Opaque refresh tokens: each one can be exchanged once, for the next token of its session. */
export class SessionStore {
  async issue(userId: Types.ObjectId, familyId: string = randomUUID()): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await RefreshTokenModel.create({
      userId,
      tokenHash: hashToken(token),
      familyId,
      expiresAt: new Date(Date.now() + refreshTokenTtlSeconds() * 1000),
    });
    return token;
  }

  async rotate(token: string): Promise<{ userId: Types.ObjectId; refreshToken: string }> {
    const record = await this.find(token);
    if (!record || record.revokedAt || record.expiresAt <= new Date()) {
      throw sessionExpired();
    }
    if (!record.usedAt) {
      // Conditional, so of two exchanges of one token only one wins.
      const { modifiedCount } = await RefreshTokenModel.updateOne(
        { _id: record._id, usedAt: { $exists: false }, revokedAt: { $exists: false } },
        { $set: { usedAt: new Date() } }
      );
      if (modifiedCount) {
        return {
          userId: record.userId,
          refreshToken: await this.issue(record.userId, record.familyId),
        };
      }
    }
    // A used token presented again was copied: end the whole session, the copy included.
    await this.revokeFamily(record.familyId);
    throw sessionExpired();
  }

  async revoke(token: string): Promise<void> {
    const record = await this.find(token);
    if (record) await this.revokeFamily(record.familyId);
  }

  private find(token: string) {
    if (!token) return null;
    return RefreshTokenModel.findOne({ tokenHash: hashToken(token) }).lean();
  }

  private async revokeFamily(familyId: string) {
    await RefreshTokenModel.updateMany(
      { familyId, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } }
    );
  }
}
