import { randomBytes } from 'crypto';

/** Where the uploads of one user are stored: a key outside it was not issued to that user. */
export const uploadKeyPrefix = (userId: string) => `uploads/${userId}/`;

/**
 * The key of a new upload: `uploads/<user id>/<time>-<random>-<file name>`. The random part keeps
 * two uploads of one file apart and makes the key of someone else's upload impossible to guess;
 * slashes in the file name are replaced, so the key stays directly under the user's prefix.
 */
export const buildUploadKey = (userId: string, filename: string, now = Date.now()) =>
  `${uploadKeyPrefix(userId)}${now}-${randomBytes(6).toString('hex')}-${filename.replace(/[\\/]/g, '_')}`;

/** True for a key `buildUploadKey` could have issued to this user. */
export const isUploadKeyOf = (key: string, userId: string) => {
  const prefix = uploadKeyPrefix(userId);
  const name = key.slice(prefix.length);
  return key.startsWith(prefix) && name.length > 0 && !name.includes('/');
};
