import { getModelForClass } from '@typegoose/typegoose';

import { User } from '../classes/User';

export const usersCollectionName = 'users';

export const UserModel = getModelForClass(User, {
  schemaOptions: { collection: usersCollectionName },
});
