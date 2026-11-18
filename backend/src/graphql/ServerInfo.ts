import { Query, Resolver } from 'type-graphql';
import { ServerInfo } from './classes/ServerInfo';

@Resolver()
export class ServerInfoApi {
  private readonly startedAt = Date.now();

  @Query(() => ServerInfo, {
    description: 'Version, status and uptime of the backend. Needs no authentication.',
  })
  serverInfo(): ServerInfo {
    return {
      version: process.env.npm_package_version || 'dev',
      status: 'ok',
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
    };
  }
}
