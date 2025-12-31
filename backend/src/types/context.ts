import { Request, Response } from 'express';
import { Types } from 'mongoose';

export type GraphQLContext = {
  req: Request;
  res: Response;
};

export type ObjectIdOrString = Types.ObjectId | string;
