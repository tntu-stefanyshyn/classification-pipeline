import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// eslint-disable-next-line import/default -- the plugin's default export is not visible to the import plugin
import checker from 'vite-plugin-checker';

// https://vitejs.dev/config
export default defineConfig({
  // Electron loads the renderer from this port, and the backend allows its origin
  // (`http://localhost:5173`) by default (`CORS_ORIGINS`, backend/src/config/config.ts). With
  // `strictPort`, a busy port stops the start instead of moving the renderer to the next free
  // port, whose origin the backend would block. Change both together.
  server: {
    port: 5173,
    strictPort: true,
  },
  plugins: [
    react(),
    checker({
      typescript: true,
      overlay: true,
    }),
  ],
});
