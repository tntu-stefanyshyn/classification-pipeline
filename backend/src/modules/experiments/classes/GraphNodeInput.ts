import { Field, ID, InputType } from 'type-graphql';
import { ClassificationStage } from './ClassificationStage';
import { GraphNodeSetting } from './GraphNodeSetting';

@InputType({
  description: 'A graph node to save. The stage must come after the stage of its parent.',
})
export class GraphNodeInput {
  @Field(() => ID, { description: 'Id of the node, unique in the graph.' })
  _id!: string;

  @Field({ description: 'Name shown for the node.' })
  label!: string;

  @Field(() => ClassificationStage, { description: 'Stage the node belongs to.' })
  stage!: ClassificationStage;

  @Field({ description: 'Name of the technology; it must belong to the stage.' })
  technology!: string;

  @Field(() => [GraphNodeSetting], {
    nullable: true,
    description: 'Values of the technology settings.',
  })
  settings?: GraphNodeSetting[];

  @Field({ description: 'Kind of the node, `technology` for technology nodes.' })
  type!: string;

  @Field(() => ID, {
    nullable: true,
    description: 'Id of the parent node. Leave it empty for a node that starts a path.',
  })
  parentId?: string;
}
