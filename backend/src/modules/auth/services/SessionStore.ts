import { createHash, randomBytes, randomUUID } from 'crypto';
import { Types } from 'mongoose';

import { AuthenticationError } from '../classes/AuthenticationError';
import { refreshTokenTtlSeconds } from '../constants/token';
import { RefreshTokenModel } from '../models/RefreshTokenModel';
import { SessionModel } from '../models/SessionModel';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const nextExpiry = () => new Date(Date.now() + refreshTokenTtlSeconds() * 1000);

/**
 * Opaque refresh tokens: each one can be exchanged once, for the next token of its session.
 *
 * Revocation and rotation meet at the session document: `revokeSession` sets `revokedAt` there
 * before anything else, and `rotate` checks it before the exchange and again after the successor
 * is stored. A revocation that lands between the two checks therefore keeps the successor from
 * being handed out, and any later exchange of a token of that session fails the first check.
 */
export class SessionStore {
  /** Starts a session for a login and returns its first refresh token. */
  async start(userId: Types.ObjectId): Promise<string> {
    const sessionId = randomUUID();
    await SessionModel.create({ _id: sessionId, userId, expiresAt: nextExpiry() });
    return this.issue(userId, sessionId);
  }

  async rotate(token: string): Promise<{ userId: Types.ObjectId; refreshToken: string }> {
    const record = await this.find(token);
    if (!record || record.revokedAt || record.expiresAt <= new Date()) {
      throw AuthenticationError.sessionExpired();
    }
    if (!(await this.isActive(record.familyId))) {
      throw AuthenticationError.sessionExpired();
    }
    if (!record.usedAt) {
      // Conditional, so of two exchanges of one token only one wins.
      const { modifiedCount } = await RefreshTokenModel.updateOne(
        { _id: record._id, usedAt: { $exists: false }, revokedAt: { $exists: false } },
        { $set: { usedAt: new Date() } }
      );
      if (modifiedCount) {
        const refreshToken = await this.issue(record.userId, record.familyId);
        if (!(await this.isActive(record.familyId))) {
          // Revoked while the successor was being stored: it must not reach the client.
          throw AuthenticationError.sessionExpired();
        }
        return { userId: record.userId, refreshToken };
      }
    }
    // A used token presented again was copied: end the whole session, the copy included.
    await this.revokeSession(record.familyId);
    throw AuthenticationError.sessionExpired();
  }

  async revoke(token: string): Promise<void> {
    const record = await this.find(token);
    if (record) await this.revokeSession(record.familyId);
  }

  private async issue(userId: Types.ObjectId, sessionId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = nextExpiry();
    await RefreshTokenModel.create({
      userId,
      tokenHash: hashToken(token),
      familyId: sessionId,
      expiresAt,
    });
    await SessionModel.updateOne({ _id: sessionId }, { $max: { expiresAt } });
    return token;
  }

  private find(token: string) {
    if (!token) return null;
    return RefreshTokenModel.findOne({ tokenHash: hashToken(token) }).lean();
  }

  private async isActive(sessionId: string) {
    const session = await SessionModel.exists({
      _id: sessionId,
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });
    return Boolean(session);
  }

  private async revokeSession(sessionId: string) {
    const revokedAt = new Date();
    // The session first: it is what rotation checks.
    await SessionModel.updateOne(
      { _id: sessionId, revokedAt: { $exists: false } },
      { $set: { revokedAt } }
    );
    await RefreshTokenModel.updateMany(
      { familyId: sessionId, revokedAt: { $exists: false } },
      { $set: { revokedAt } }
    );
  }
}
