import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

import { config } from '../../../config/config';

/** Where the uploads of one user are stored. */
export const uploadKeyPrefix = (userId: string) => `uploads/${userId}/`;

// `<time>-<random>-<signature>-<file name>`, directly under the user's prefix.
const ISSUED_NAME = /^(\d+-[0-9a-f]{12})-([0-9a-f]{32})-([^/]+)$/;

// Only the backend holds the secret, so only `buildUploadKey` can produce a matching signature;
// the prefix keeps it apart from the other uses of JWT_SECRET.
const sign = (userId: string, stamp: string, name: string) =>
  createHmac('sha256', config.jwtSecret)
    .update(`upload-key:${userId}/${stamp}-${name}`)
    .digest('hex')
    .slice(0, 32);

/**
 * The key of a new upload: `uploads/<user id>/<time>-<random>-<signature>-<file name>`. The
 * random part keeps two uploads of one file apart and makes the key of someone else's upload
 * impossible to guess. The signature covers the user, the time, the random part and the name, so
 * a key the caller built or changed is not one the backend issued. Slashes in the file name are
 * replaced, so the key stays directly under the user's prefix.
 */
export const buildUploadKey = (userId: string, filename: string, now = Date.now()) => {
  const stamp = `${now}-${randomBytes(6).toString('hex')}`;
  const name = filename.replace(/[\\/]/g, '_');
  return `${uploadKeyPrefix(userId)}${stamp}-${sign(userId, stamp, name)}-${name}`;
};

/** True only for a key `buildUploadKey` issued to this user: its signature is checked. */
export const isUploadKeyIssuedTo = (key: string, userId: string) => {
  const prefix = uploadKeyPrefix(userId);
  const match = key.startsWith(prefix) ? ISSUED_NAME.exec(key.slice(prefix.length)) : null;
  if (!match) return false;
  const [, stamp, signature, name] = match;
  // Both are 32 hex characters: the pattern fixes the length of the provided one.
  return timingSafeEqual(Buffer.from(sign(userId, stamp, name)), Buffer.from(signature));
};
