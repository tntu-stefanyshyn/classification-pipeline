import { getModelForClass } from '@typegoose/typegoose';

import { User } from '../classes/User';

export const UserModel = getModelForClass(User);
