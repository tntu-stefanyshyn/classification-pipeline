import { Types } from 'mongoose';
import { ObjectIdOrString } from '../types/context';

export const stringIdsToObjectIds = (ids: ObjectIdOrString[]) =>
  ids.map((id) => new Types.ObjectId(id));

export const stringIdToObjectId = (id: ObjectIdOrString) => new Types.ObjectId(id);

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
