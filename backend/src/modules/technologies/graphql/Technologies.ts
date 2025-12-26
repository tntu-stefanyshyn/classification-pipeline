import { Query, Resolver } from 'type-graphql';
import { Technology } from '../classes/Technology';
import { TechnologyManager } from '../services/TechnologyManager';

@Resolver()
export class Technologies {
  private readonly manager = new TechnologyManager();

  @Query(() => [Technology])
  technologies(): Promise<Technology[]> {
    return this.manager.list();
  }
}
