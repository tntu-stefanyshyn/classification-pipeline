import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = {
  [_ in K]?: never;
};
export type Incremental<T> =
  | T
  | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
const defaultOptions = {} as const;
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
};

export type Query = {
  __typename?: 'Query';
  serverInfo: ServerInfo;
};

export type ServerInfo = {
  __typename?: 'ServerInfo';
  status: Scalars['String']['output'];
  uptimeSeconds: Scalars['Int']['output'];
  version: Scalars['String']['output'];
};

export type ServerInfoQueryVariables = Exact<{ [key: string]: never }>;

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
export function useServerInfoQuery(
  baseOptions?: Apollo.QueryHookOptions<ServerInfoQuery, ServerInfoQueryVariables>
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<ServerInfoQuery, ServerInfoQueryVariables>(ServerInfoDocument, options);
}
export function useServerInfoLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<ServerInfoQuery, ServerInfoQueryVariables>
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<ServerInfoQuery, ServerInfoQueryVariables>(
    ServerInfoDocument,
    options
  );
}
export function useServerInfoSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<ServerInfoQuery, ServerInfoQueryVariables>
) {
  const options =
    baseOptions === Apollo.skipToken ? baseOptions : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<ServerInfoQuery, ServerInfoQueryVariables>(
    ServerInfoDocument,
    options
  );
}
export type ServerInfoQueryHookResult = ReturnType<typeof useServerInfoQuery>;
export type ServerInfoLazyQueryHookResult = ReturnType<typeof useServerInfoLazyQuery>;
export type ServerInfoSuspenseQueryHookResult = ReturnType<typeof useServerInfoSuspenseQuery>;
export type ServerInfoQueryResult = Apollo.QueryResult<ServerInfoQuery, ServerInfoQueryVariables>;
