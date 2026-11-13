import { Query, Resolver } from 'type-graphql';

@Resolver()
export class Health {
  @Query(() => String, {
    description: 'Liveness check. Returns `ok` while the backend runs. Needs no authentication.',
  })
  health(): string {
    return 'ok';
  }
}
