import { getModelForClass } from '@typegoose/typegoose';

import { Session } from '../classes/Session';

export const sessionsCollectionName = 'sessions';

export const SessionModel = getModelForClass(Session, {
  schemaOptions: { collection: sessionsCollectionName },
});
