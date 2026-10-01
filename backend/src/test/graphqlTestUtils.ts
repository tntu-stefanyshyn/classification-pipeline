import 'reflect-metadata';
import type { Request, Response } from 'express';
import { graphql, type GraphQLSchema } from 'graphql';
import { buildSchemaSync, type NonEmptyArray } from 'type-graphql';

import type { GraphQLContext } from '../types/context';

type ResolverClass = new (...args: any[]) => unknown;

type ExecuteGraphqlOptions = {
  context?: GraphQLContext;
  operationName?: string;
  variables?: Record<string, unknown>;
};

export const buildGraphqlSchema = (resolvers: ResolverClass[]): GraphQLSchema => {
  return buildSchemaSync({
    resolvers: resolvers as NonEmptyArray<ResolverClass>,
    validate: { forbidUnknownValues: false },
  });
};

export const createGraphqlContext = (overrides: Partial<GraphQLContext> = {}): GraphQLContext => {
  return {
    req: { headers: {} } as Request,
    res: {} as Response,
    ...overrides,
  } as GraphQLContext;
};

export const executeGraphql = (
  schema: GraphQLSchema,
  source: string,
  options: ExecuteGraphqlOptions = {}
) => {
  return graphql({
    schema,
    source,
    contextValue: options.context ?? createGraphqlContext(),
    operationName: options.operationName,
    variableValues: options.variables,
  });
};

export const toPlainValue = <T>(value: T): T => {
  if (value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
};
