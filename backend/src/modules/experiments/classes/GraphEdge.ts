import { Types } from 'mongoose';
import { Field, ID, ObjectType } from 'type-graphql';

@ObjectType()
export class GraphEdge {
  @Field(() => ID)
  _id!: Types.ObjectId;

  @Field()
  from!: string;

  @Field()
  to!: string;
}
