import * as SchemaTypes from '../../types.generated';

import { gql } from '@apollo/client';
import * as ApolloReactCommon from '@apollo/client/react/hooks';
import * as ApolloReactHooks from '@apollo/client/react/hooks';
const defaultOptions = {} as const;
export type RegisterMutationVariables = SchemaTypes.Exact<{
  email: SchemaTypes.Scalars['String']['input'];
  password: SchemaTypes.Scalars['String']['input'];
  name?: SchemaTypes.InputMaybe<SchemaTypes.Scalars['String']['input']>;
}>;

export type RegisterMutation = {
  __typename?: 'Mutation';
  register: {
    __typename?: 'AuthPayload';
    token: string;
    user: { __typename?: 'User'; id: string; email: string; name?: string | null };
  };
};

export const RegisterDocument = gql`
  mutation Register($email: String!, $password: String!, $name: String) {
    register(input: { email: $email, password: $password, name: $name }) {
      token
      user {
        id
        email
        name
      }
    }
  }
`;

/**
 * __useRegisterMutation__
 *
 * To run a mutation, you first call `useRegisterMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useRegisterMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [registerMutation, { data, loading, error }] = useRegisterMutation({
 *   variables: {
 *      email: // value for 'email'
 *      password: // value for 'password'
 *      name: // value for 'name'
 *   },
 * });
 */
export function useRegisterMutation(
  baseOptions?: ApolloReactHooks.MutationHookOptions<RegisterMutation, RegisterMutationVariables>
) {
  const options = { ...defaultOptions, ...baseOptions };
  return ApolloReactHooks.useMutation<RegisterMutation, RegisterMutationVariables>(
    RegisterDocument,
    options
  );
}
export type RegisterMutationHookResult = ReturnType<typeof useRegisterMutation>;
export type RegisterMutationOptions = ApolloReactCommon.BaseMutationOptions<
  RegisterMutation,
  RegisterMutationVariables
>;
