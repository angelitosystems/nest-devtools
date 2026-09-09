import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const configDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: process.env.DOCS_BASE ?? '/nest-devtools/',
  server: {
    port: 5174,
  },
  resolve: {
    alias: {
      '@docs': resolve(configDir, '../../docs'),
    },
  },
  build: {
    outDir: 'dist',
  },
});
