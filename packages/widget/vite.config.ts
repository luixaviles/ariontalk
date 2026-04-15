import { defineConfig } from 'vite';
import { resolve } from 'path';

const isCDN = process.env.BUILD_TARGET === 'cdn';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: isCDN ? 'ariontalk' : 'ariontalk.esm',
    },
    emptyOutDir: false,
    target: 'es2021',
    minify: 'terser',
    rollupOptions: {
      ...(isCDN
        ? {
            // CDN: bundle everything into a single file
            output: {
              entryFileNames: 'ariontalk.js',
              inlineDynamicImports: true,
            },
          }
        : {
            // NPM: externalize lit for tree-shaking with bundlers
            external: ['lit', /^lit\//, /^@lit\//],
            output: {
              entryFileNames: 'ariontalk.esm.js',
            },
          }),
    },
  },
  server: {
    open: '/dev/index.html',
  },
});
