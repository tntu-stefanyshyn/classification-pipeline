const nodeEnv = process.env.NODE_ENV ?? 'production';

export const config = {
  main: {
    nodeEnv,
    isDev: nodeEnv === 'development',
    devServerUrl: process.env.MAIN_WINDOW_VITE_DEV_SERVER_URL,
    rendererName: process.env.MAIN_WINDOW_VITE_NAME || 'main_window',
  },
  renderer: {
    graphqlEndpoint: import.meta.env.VITE_GRAPHQL_ENDPOINT || 'http://localhost:4000/graphql',
    isDev: import.meta.env.DEV,
  },
} as const;

export type AppConfig = typeof config;
