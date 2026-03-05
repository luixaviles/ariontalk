import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'ariontalk',
    },
    emptyOutDir: false,
    target: 'es2021',
    minify: 'terser',
    rollupOptions: {
      external: ['lit', /^lit\//, /^@lit\//],
      output: {
        entryFileNames: 'ariontalk.js',
      },
    },
  },
  server: {
    open: '/dev/index.html',
  },
});
