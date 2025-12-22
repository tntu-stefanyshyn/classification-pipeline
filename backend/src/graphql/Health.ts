import { Query, Resolver } from 'type-graphql';

@Resolver()
export class Health {
  @Query(() => String)
  health(): string {
    return 'ok';
  }
}
