import * as SchemaTypes from '../../types.generated';

import { gql } from '@apollo/client';
import * as ApolloReactCommon from '@apollo/client/react/hooks';
import * as ApolloReactHooks from '@apollo/client/react/hooks';
const defaultOptions = {} as const;
export type ServerInfoQueryVariables = SchemaTypes.Exact<{ [key: string]: never }>;

export type ServerInfoQuery = {
  __typename?: 'Query';
  serverInfo: { __typename?: 'ServerInfo'; version: string; status: string; uptimeSeconds: number };
};

export const ServerInfoDocument = gql`
  query ServerInfo {
    serverInfo {
      version
      status
      uptimeSeconds
    }
  }
`;

/**
 * __useServerInfoQuery__
 *
 * To run a query within a React component, call `useServerInfoQuery` and pass it any options that fit your needs.
 * When your component renders, `useServerInfoQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useServerInfoQuery({
 *   variables: {
 *   },
 * });
 */
export function useServerInfoQuery(
  baseOptions?: ApolloReactHooks.QueryHookOptions<ServerInfoQuery, ServerInfoQueryVariables>
) {
  const options = { ...defaultOptions, ...baseOptions };
  return ApolloReactHooks.useQuery<ServerInfoQuery, ServerInfoQueryVariables>(
    ServerInfoDocument,
    options
  );
}
export function useServerInfoLazyQuery(
  baseOptions?: ApolloReactHooks.LazyQueryHookOptions<ServerInfoQuery, ServerInfoQueryVariables>
) {
  const options = { ...defaultOptions, ...baseOptions };
  return ApolloReactHooks.useLazyQuery<ServerInfoQuery, ServerInfoQueryVariables>(
    ServerInfoDocument,
    options
  );
}
// @ts-ignore
export function useServerInfoSuspenseQuery(
  baseOptions?: ApolloReactHooks.SuspenseQueryHookOptions<ServerInfoQuery, ServerInfoQueryVariables>
): ApolloReactHooks.UseSuspenseQueryResult<ServerInfoQuery, ServerInfoQueryVariables>;
export function useServerInfoSuspenseQuery(
  baseOptions?:
    | ApolloReactHooks.SkipToken
    | ApolloReactHooks.SuspenseQueryHookOptions<ServerInfoQuery, ServerInfoQueryVariables>
): ApolloReactHooks.UseSuspenseQueryResult<ServerInfoQuery | undefined, ServerInfoQueryVariables>;
export function useServerInfoSuspenseQuery(
  baseOptions?:
    | ApolloReactHooks.SkipToken
    | ApolloReactHooks.SuspenseQueryHookOptions<ServerInfoQuery, ServerInfoQueryVariables>
) {
  const options =
    baseOptions === ApolloReactHooks.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return ApolloReactHooks.useSuspenseQuery<ServerInfoQuery, ServerInfoQueryVariables>(
    ServerInfoDocument,
    options
  );
}
export type ServerInfoQueryHookResult = ReturnType<typeof useServerInfoQuery>;
export type ServerInfoLazyQueryHookResult = ReturnType<typeof useServerInfoLazyQuery>;
export type ServerInfoSuspenseQueryHookResult = ReturnType<typeof useServerInfoSuspenseQuery>;
export function refetchServerInfoQuery(variables?: ServerInfoQueryVariables) {
  return { query: ServerInfoDocument, variables: variables };
}
