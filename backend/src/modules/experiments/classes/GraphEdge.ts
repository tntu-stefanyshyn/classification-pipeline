import { Field, ID, ObjectType } from 'type-graphql';

@ObjectType()
export class GraphEdge {
  @Field(() => ID)
  id!: string;

  @Field()
  from!: string;

  @Field()
  to!: string;
}
