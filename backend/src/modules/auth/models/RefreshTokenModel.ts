import { getModelForClass } from '@typegoose/typegoose';

import { RefreshToken } from '../classes/RefreshToken';

export const refreshTokensCollectionName = 'refresh_tokens';

export const RefreshTokenModel = getModelForClass(RefreshToken, {
  schemaOptions: { collection: refreshTokensCollectionName },
});
