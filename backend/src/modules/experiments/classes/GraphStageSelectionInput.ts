import { Field, ID, InputType } from 'type-graphql';
import { ClassificationStage } from './ClassificationStage';

@InputType({ description: 'The technologies chosen for one stage.' })
export class GraphStageSelectionInput {
  @Field(() => ClassificationStage, { description: 'The stage.' })
  stage!: ClassificationStage;

  @Field(() => [ID], {
    description: 'Ids of the technologies for the stage; each must belong to it.',
  })
  technologyIds!: string[];
}
