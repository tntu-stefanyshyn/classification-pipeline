import { Query, Resolver } from 'type-graphql';
import { ServerInfo } from './classes/ServerInfo';

@Resolver()
export class ServerInfoApi {
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
