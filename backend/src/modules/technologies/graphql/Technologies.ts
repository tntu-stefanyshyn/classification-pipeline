import { Query, Resolver } from 'type-graphql';
import { Technology } from '../classes/Technology';
import { TechnologyManager } from '../services/TechnologyManager';

@Resolver()
export class Technologies {
  private readonly manager = new TechnologyManager();

  @Query(() => [Technology], {
    description: 'The catalog of technologies that can be used as graph nodes.',
  })
  technologies(): Promise<Technology[]> {
    return this.manager.list();
  }
}
