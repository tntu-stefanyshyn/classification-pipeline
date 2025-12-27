import { Field, ID, InputType } from 'type-graphql';
import { ClassificationStage } from './ClassificationStage';

@InputType()
export class GraphStageSelectionInput {
  @Field(() => ClassificationStage)
  stage!: ClassificationStage;

  @Field(() => [ID])
  technologyIds!: string[];
}
