import { index, prop } from '@typegoose/typegoose';
import { TimeStamps } from '@typegoose/typegoose/lib/defaultClasses';
import { Types } from 'mongoose';

// MongoDB removes a token once it expires; used and revoked tokens stay until then, so a reused
// token is still recognised as reused.
@index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
@index({ familyId: 1 })
export class RefreshToken extends TimeStamps {
  _id!: Types.ObjectId;

  @prop({ required: true, type: () => Types.ObjectId })
  userId!: Types.ObjectId;

  /** SHA-256 of the token; the token itself is never stored. */
  @prop({ required: true, unique: true })
  tokenHash!: string;

  /** All tokens rotated from one login share it; reuse of any of them revokes the family. */
  @prop({ required: true })
  familyId!: string;

  @prop({ required: true })
  expiresAt!: Date;

  /** Set when the token is exchanged for the next one. */
  @prop()
  usedAt?: Date;

  @prop()
  revokedAt?: Date;
}
