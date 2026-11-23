import { Types } from 'mongoose';
import { Field, ID, ObjectType } from 'type-graphql';

@ObjectType({ description: 'A connection between two graph nodes.' })
export class GraphEdge {
  @Field(() => ID, { description: 'Id of the edge.' })
  _id!: Types.ObjectId;

  @Field({ description: 'Id of the parent node.' })
  from!: string;

  @Field({ description: 'Id of the child node.' })
  to!: string;
}
