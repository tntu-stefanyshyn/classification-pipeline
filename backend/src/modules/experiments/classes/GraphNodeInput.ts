import { Field, ID, InputType } from 'type-graphql';
import { ClassificationStage } from './ClassificationStage';
import { GraphNodeSetting } from './GraphNodeSetting';

@InputType()
export class GraphNodeInput {
  @Field(() => ID)
  _id!: string;

  @Field()
  label!: string;

  @Field(() => ClassificationStage)
  stage!: ClassificationStage;

  @Field()
  technology!: string;

  @Field(() => [GraphNodeSetting], { nullable: true })
  settings?: GraphNodeSetting[];

  @Field()
  type!: string;

  @Field(() => ID, { nullable: true })
  parentId?: string;
}
