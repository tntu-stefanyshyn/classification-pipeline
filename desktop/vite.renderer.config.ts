import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// eslint-disable-next-line import/default -- the plugin's default export is not visible to the import plugin
import checker from 'vite-plugin-checker';

// https://vitejs.dev/config
export default defineConfig({
  plugins: [
    react(),
    checker({
      typescript: true,
      overlay: true,
    }),
  ],
});
