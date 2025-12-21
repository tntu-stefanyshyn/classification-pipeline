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

export type Mutation = {
  __typename?: 'Mutation';
  login: AuthPayload;
  register: AuthPayload;
};

export type MutationloginArgs = {
  input: LoginInput;
};

export type MutationregisterArgs = {
  input: RegisterInput;
};

export type ServerInfo = {
  __typename?: 'ServerInfo';
  version: Scalars['String']['output'];
  status: Scalars['String']['output'];
  uptimeSeconds: Scalars['Int']['output'];
};

export type User = {
  __typename?: 'User';
  id: Scalars['ID']['output'];
  email: Scalars['String']['output'];
  name?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
};

export type AuthPayload = {
  __typename?: 'AuthPayload';
  token: Scalars['String']['output'];
  user: User;
};

export interface LoginInput {
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
}

export interface RegisterInput {
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
}
