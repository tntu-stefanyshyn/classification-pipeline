import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'schema.graphql',
  documents: ['./src/**/*.graphql'],
  hooks: {
    afterAllFileWrite: ['prettier --write'],
  },
  config: {
    sort: false,
  },
   generates: {
   'src/graphql/types.generated.ts': {
      plugins: ['typescript'],
      config: {
        declarationKind: {
          type: 'type',
          input: 'interface',
        },
        enumsAsTypes: false,
        namingConvention: {
          typeNames: 'keep',
          enumValues: 'keep',
        },
      },
    },
    'src/graphql/': {
      preset: 'near-operation-file',
      presetConfig: {
        folder: 'generated',
        extension: '.ts',
        baseTypesPath: 'types.generated.ts',
        importTypesNamespace: 'SchemaTypes',
      },
      plugins: ['typescript-operations', 'typescript-react-apollo'],
      config: {
        withHooks: true,
        withResultType: false,
        withMutationFn: false,
        arrayInputCoercion: false,
        preResolveTypes: true,
        dedupeOperationSuffix: true,
        withRefetchFn: true,
       experimentalFragmentVariables: true,
        dedupeFragments: false,
        namingConvention: {
          typeNames: 'keep',
          enumValues: 'keep',
        },
      },
    },
  },
};

export default config;
