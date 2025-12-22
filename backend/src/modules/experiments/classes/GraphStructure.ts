import { Field, ID, ObjectType } from 'type-graphql';
import { GraphNode } from './GraphNode';
import { GraphEdge } from './GraphEdge';

@ObjectType()
export class GraphStructure {
  @Field(() => ID)
  id!: string;

  @Field()
  experimentId!: string;

  @Field(() => [GraphNode])
  nodes!: GraphNode[];

  @Field(() => [GraphEdge])
  edges!: GraphEdge[];

  @Field(() => Date)
  createdAt!: Date;
}
