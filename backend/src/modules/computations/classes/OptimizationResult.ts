import { Field, ID, ObjectType } from 'type-graphql';

@ObjectType()
export class OptimizationResult {
  @Field(() => ID)
  runId!: string;

  @Field(() => [ID])
  pathNodeIds!: string[];

  @Field()
  score!: number;
}
