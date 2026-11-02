import { index, prop } from '@typegoose/typegoose';
import { TimeStamps } from '@typegoose/typegoose/lib/defaultClasses';
import { Types } from 'mongoose';

/**
 * One login and every refresh token rotated from it. `revokedAt` is the state that rotation and
 * revocation share: revocation sets it first, rotation checks it before and after issuing a token.
 */
@index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
export class Session extends TimeStamps {
  /** The `familyId` of the session's refresh tokens. */
  @prop({ required: true })
  _id!: string;

  @prop({ required: true, type: () => Types.ObjectId })
  userId!: Types.ObjectId;

  /** Expiry of the newest refresh token; MongoDB removes the session after it. */
  @prop({ required: true })
  expiresAt!: Date;

  @prop()
  revokedAt?: Date;
}
