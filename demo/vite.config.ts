import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@ariontalk/core': resolve(__dirname, '../packages/core/src/index.ts'),
      '@ariontalk/widget': resolve(__dirname, '../packages/widget/src/index.ts'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        en: resolve(__dirname, 'en.html'),
        enAi: resolve(__dirname, 'en-ai.html'),
        es: resolve(__dirname, 'es.html'),
        esAi: resolve(__dirname, 'es-ai.html'),
      },
    },
  },
});
