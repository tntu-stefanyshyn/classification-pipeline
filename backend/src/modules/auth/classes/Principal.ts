import { Types } from 'mongoose';

/** Who made a request, once the resolver layer has authenticated it. */
export type Principal = { kind: 'user'; userId: Types.ObjectId } | { kind: 'service' };
