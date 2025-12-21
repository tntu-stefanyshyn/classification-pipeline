const nodeEnv = process.env.NODE_ENV ?? 'production';

export const config = {
  main: {
    nodeEnv,
    isDev: nodeEnv === 'development',
  },
  renderer: {
    graphqlEndpoint: import.meta.env.VITE_GRAPHQL_ENDPOINT || 'http://localhost:4000/graphql',
    isDev: import.meta.env.DEV,
  },
} as const;

export type AppConfig = typeof config;
