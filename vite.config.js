import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the built app works when Electron loads it from the filesystem.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist' },
  server: { port: 5173, strictPort: true },
});
