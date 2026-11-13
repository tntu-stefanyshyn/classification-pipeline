import { Field, ID, ObjectType } from 'type-graphql';

@ObjectType({ description: 'The best pipeline found by the optimization.' })
export class OptimizationResult {
  @Field(() => ID, { description: 'Id of the best pipeline.' })
  runId!: string;

  @Field(() => [ID], { description: 'Ids of the graph nodes on its path.' })
  pathNodeIds!: string[];

  @Field({ description: 'Its integral score. A lower score is better.' })
  score!: number;
}
