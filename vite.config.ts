import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/ariontalk.ts'),
      formats: ['es'],
      fileName: 'ariontalk',
    },
    target: 'es2021',
    minify: 'terser',
    rollupOptions: {
      output: {
        entryFileNames: 'ariontalk.js',
      },
    },
  },
  server: {
    open: '/dev/index.html',
  },
});
