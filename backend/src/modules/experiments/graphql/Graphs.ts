import { Arg, ID, Query, Resolver } from 'type-graphql';
import { GraphStructure } from '../classes/GraphStructure';
import { GraphManager } from '../services/GraphManager';

@Resolver(() => GraphStructure)
export class Graphs {
  private readonly graphManager = new GraphManager();

  @Query(() => GraphStructure, { nullable: true })
  graphStructure(
    @Arg('experimentId', () => ID) experimentId: string
  ): Promise<GraphStructure | null> {
    const trimmedId = experimentId.trim();
    if (!trimmedId) {
      throw new Error('Experiment _id is required');
    }
    return this.graphManager.getByExperimentId(trimmedId);
  }
}
