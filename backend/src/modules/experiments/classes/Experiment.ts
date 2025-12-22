import { Field, ID, Int, ObjectType } from 'type-graphql';
import { GraphStructure } from './GraphStructure';

@ObjectType()
export class Experiment {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field({ nullable: true })
  description?: string;

  @Field()
  status!: string;

  @Field(() => Int)
  runs!: number;

  @Field(() => Date)
  createdAt!: Date;

  @Field({ nullable: true })
  fileName?: string;

  @Field(() => GraphStructure, { nullable: true })
  graph?: GraphStructure;
}
