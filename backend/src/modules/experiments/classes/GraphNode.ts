import { Field, ID, ObjectType } from 'type-graphql';

@ObjectType()
export class GraphNode {
  @Field(() => ID)
  id!: string;

  @Field()
  label!: string;

  @Field({ nullable: true })
  type?: string;

  @Field(() => [GraphNode])
  children!: GraphNode[];
}
