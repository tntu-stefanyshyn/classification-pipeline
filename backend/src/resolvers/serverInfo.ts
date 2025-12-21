import { Field, Int, ObjectType, Query, Resolver } from 'type-graphql';

@ObjectType()
class ServerInfo {
  @Field()
  version!: string;

  @Field()
  status!: string;

  @Field(() => Int)
  uptimeSeconds!: number;
}

@Resolver()
export class ServerInfoResolver {
  private readonly startedAt = Date.now();

  @Query(() => ServerInfo)
  serverInfo(): ServerInfo {
    return {
      version: process.env.npm_package_version || 'dev',
      status: 'ok',
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
    };
  }
}
