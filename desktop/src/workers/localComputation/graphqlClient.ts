import { print, type DocumentNode } from 'graphql';
import { config } from '../../config/config';

type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

export const isFetchAvailable = () => typeof fetch === 'function';

export class GraphqlClient {
  constructor(private readonly endpoint: string) {}

  async request<TData, TVars extends Record<string, unknown> | undefined>(
    document: DocumentNode,
    variables?: TVars
  ): Promise<TData> {
    if (!isFetchAvailable()) {
      throw new Error('Fetch is not available in the main process');
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: print(document),
        variables: variables ?? {},
      }),
    });

    const payload = (await response.json()) as GraphQLResponse<TData>;
    if (!response.ok) {
      const message = payload.errors?.[0]?.message;
      throw new Error(message ?? `GraphQL request failed (${response.status})`);
    }
    if (payload.errors?.length) {
      throw new Error(payload.errors[0]?.message ?? 'GraphQL request failed');
    }
    if (!payload.data) {
      throw new Error('GraphQL response is empty');
    }
    return payload.data;
  }
}

export const createGraphqlClient = () => {
  console.log(config.renderer.graphqlEndpoint);
  return new GraphqlClient(config.renderer.graphqlEndpoint);
};
