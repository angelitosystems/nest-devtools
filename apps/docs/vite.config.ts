import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  base: process.env.DOCS_BASE ?? '/nest-devtools/',
  server: {
    port: 5174,
  },
  resolve: {
    alias: {
      '@docs': resolve(__dirname, '../../docs'),
    },
  },
  build: {
    outDir: 'dist',
  },
});
