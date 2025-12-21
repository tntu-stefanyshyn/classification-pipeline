declare module '@apollo/client/react/hooks' {
  export * from '@apollo/client/react/hooks/index.js';
  export { useMutation } from '@apollo/client/react/hooks/useMutation.js';
  export { useQuery } from '@apollo/client/react/hooks/useQuery.js';
  export { useLazyQuery } from '@apollo/client/react/hooks/useLazyQuery.js';
  export { useSuspenseQuery } from '@apollo/client/react/hooks/useSuspenseQuery.js';
  export { skipToken } from '@apollo/client/react/hooks/constants.js';
  export type SkipToken = import('@apollo/client/react/hooks/constants.js').SkipToken;
  export type MutationHookOptions<
    TData = unknown,
    TVariables extends import('@apollo/client').OperationVariables = import('@apollo/client').OperationVariables
  > = import('@apollo/client/react/hooks/useMutation.js').useMutation.Options<TData, TVariables>;
  export type BaseMutationOptions<
    TData = unknown,
    TVariables extends import('@apollo/client').OperationVariables = import('@apollo/client').OperationVariables
  > = import('@apollo/client').MutationOptions<TData, TVariables>;
  export type QueryHookOptions<
    TData = unknown,
    TVariables extends import('@apollo/client').OperationVariables = import('@apollo/client').OperationVariables
  > = import('@apollo/client/react/hooks/useQuery.js').useQuery.Options<TData, TVariables>;
  export type LazyQueryHookOptions<
    TData = unknown,
    TVariables extends import('@apollo/client').OperationVariables = import('@apollo/client').OperationVariables
  > = import('@apollo/client/react/hooks/useLazyQuery.js').useLazyQuery.Options<TData, TVariables>;
  export type SuspenseQueryHookOptions<
    TData = unknown,
    TVariables extends import('@apollo/client').OperationVariables = import('@apollo/client').OperationVariables
  > = import('@apollo/client/react/hooks/useSuspenseQuery.js').useSuspenseQuery.Options<TVariables>;
  export type UseSuspenseQueryResult<
    TData = unknown,
    TVariables extends import('@apollo/client').OperationVariables = import('@apollo/client').OperationVariables
  > = import('@apollo/client/react/hooks/useSuspenseQuery.js').useSuspenseQuery.Result<TData, TVariables>;
}
