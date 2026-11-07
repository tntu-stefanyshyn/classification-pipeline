import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { Types } from 'mongoose';

import { config } from '../../../config/config';
import { AuthenticationError } from '../classes/AuthenticationError';
import { refreshTokenTtlSeconds } from '../constants/token';
import { RefreshTokenModel } from '../models/RefreshTokenModel';
import { SessionModel } from '../models/SessionModel';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const mac = (value: string) =>
  createHmac('sha256', config.jwtSecret).update(`refresh-token:${value}`).digest('base64url');

const nextExpiry = () => new Date(Date.now() + refreshTokenTtlSeconds() * 1000);

const isDuplicateKey = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;

type RefreshTokenRecord = NonNullable<Awaited<ReturnType<SessionStore['find']>>>;

/**
 * Opaque refresh tokens: each one can be exchanged once, for the next token of its session.
 *
 * A token is `<session id>.<nonce>.<signature>`: even after MongoDB removed the record of an
 * expired token, the backend still knows which session it was issued for. A session that outlives
 * one of its tokens was continued with that token, so presenting it again is reuse.
 *
 * Revocation and rotation meet at the session document: `revokeSession` sets `revokedAt` there
 * before anything else, and `rotate` checks it before the exchange and again after the successor
 * is stored. A revocation that lands between the two checks therefore keeps the successor from
 * being handed out, and any later exchange of a token of that session fails the first check.
 *
 * An exchange may carry the client's attempt id. Its successor is derived from the token and that
 * id, so when the answer is lost the same attempt gets the same successor again; any other
 * exchange of a used token is still reuse.
 */
export class SessionStore {
  /** Starts a session for a login and returns its first refresh token. */
  async start(userId: Types.ObjectId): Promise<string> {
    const sessionId = randomUUID();
    await SessionModel.create({ _id: sessionId, userId, expiresAt: nextExpiry() });
    return this.issue(userId, sessionId, randomBytes(32).toString('base64url'));
  }

  async rotate(
    token: string,
    attemptId?: string | null
  ): Promise<{ userId: Types.ObjectId; refreshToken: string }> {
    let record = await this.find(token);
    if (!record) {
      // Removed after it expired. If its session is still active, it was continued without it.
      const sessionId = this.sessionOf(token);
      if (sessionId && (await this.isActive(sessionId))) await this.revokeSession(sessionId);
      throw AuthenticationError.sessionExpired();
    }
    if (record.revokedAt || !(await this.isActive(record.familyId))) {
      throw AuthenticationError.sessionExpired();
    }
    if (!record.usedAt) {
      // Expired before it was used: the session simply ended.
      if (record.expiresAt <= new Date()) throw AuthenticationError.sessionExpired();
      // Conditional, so of two exchanges of one token only one wins.
      const { modifiedCount } = await RefreshTokenModel.updateOne(
        { _id: record._id, usedAt: { $exists: false }, revokedAt: { $exists: false } },
        {
          $set: { usedAt: new Date(), ...(attemptId ? { attemptHash: hashToken(attemptId) } : {}) },
        }
      );
      if (modifiedCount) return this.continueWith(record, this.successorNonce(token, attemptId));
      // Another exchange won: decide on what it stored.
      record = await RefreshTokenModel.findById(record._id).lean();
    }
    if (record && attemptId && record.attemptHash === hashToken(attemptId)) {
      // The same attempt again, after its answer was lost: the same successor, if still unused.
      return this.continueWith(record, this.successorNonce(token, attemptId));
    }
    // A used token presented again was copied: end the whole session, the copy included.
    if (record) await this.revokeSession(record.familyId);
    throw AuthenticationError.sessionExpired();
  }

  async revoke(token: string): Promise<void> {
    const sessionId = (await this.find(token))?.familyId ?? this.sessionOf(token);
    if (sessionId) await this.revokeSession(sessionId);
  }

  /** Stores the successor of a used token (once) and hands it out while the session is active. */
  private async continueWith(record: RefreshTokenRecord, nonce: string) {
    const refreshToken = this.sign(record.familyId, nonce);
    try {
      await this.issue(record.userId, record.familyId, nonce);
    } catch (error) {
      // Stored already by an earlier answer of the same attempt.
      if (!isDuplicateKey(error)) throw error;
      const successor = await this.find(refreshToken);
      if (!successor || successor.usedAt || successor.revokedAt) {
        await this.revokeSession(record.familyId);
        throw AuthenticationError.sessionExpired();
      }
      // The earlier answer may have failed after storing the successor, before it extended the
      // session: without this the session would still end at the old token's expiry.
      await this.extendSession(record.familyId, successor.expiresAt);
    }
    if (!(await this.isActive(record.familyId))) {
      // Revoked while the successor was being stored: it must not reach the client.
      throw AuthenticationError.sessionExpired();
    }
    return { userId: record.userId, refreshToken };
  }

  private successorNonce(token: string, attemptId?: string | null) {
    return attemptId
      ? mac(`successor:${token}:${attemptId}`)
      : randomBytes(32).toString('base64url');
  }

  private async issue(userId: Types.ObjectId, sessionId: string, nonce: string): Promise<string> {
    const token = this.sign(sessionId, nonce);
    const expiresAt = nextExpiry();
    await RefreshTokenModel.create({
      userId,
      tokenHash: hashToken(token),
      familyId: sessionId,
      expiresAt,
    });
    await this.extendSession(sessionId, expiresAt);
    return token;
  }

  /** A session lives as long as its newest token; never shortened. */
  private async extendSession(sessionId: string, expiresAt: Date) {
    await SessionModel.updateOne({ _id: sessionId }, { $max: { expiresAt } });
  }

  private sign(sessionId: string, nonce: string) {
    return `${sessionId}.${nonce}.${mac(`${sessionId}.${nonce}`)}`;
  }

  /** The session a token was issued for, if the token is one this backend signed. */
  private sessionOf(token: string): string | null {
    const [sessionId, nonce, signature, ...rest] = token.split('.');
    if (!sessionId || !nonce || !signature || rest.length) return null;
    const expected = Buffer.from(mac(`${sessionId}.${nonce}`));
    const provided = Buffer.from(signature);
    return expected.length === provided.length && timingSafeEqual(expected, provided)
      ? sessionId
      : null;
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
