import { defineConfig } from 'vite';
import { resolve } from 'path';

const isCDN = process.env.BUILD_TARGET === 'cdn';

export default defineConfig({
  build: {
    lib: {
      // Rollup allows inlineDynamicImports with a single entry only.
      entry: isCDN
        ? resolve(__dirname, 'src/index.ts')
        : {
            'ariontalk.esm': resolve(__dirname, 'src/index.ts'),
            primitives: resolve(__dirname, 'src/primitives.ts'),
          },
      formats: ['es'],
      fileName: isCDN ? 'ariontalk' : 'ariontalk.esm',
    },
    emptyOutDir: false,
    target: 'es2021',
    minify: 'terser',
    rollupOptions: {
      ...(isCDN
        ? {
            // CDN: multi-chunk ES modules with relative specifiers
            output: {
              entryFileNames: 'ariontalk.js',
              chunkFileNames: 'chunk-[name].js',
              manualChunks: {
                'engine-gemini': ['@ariontalk/engine-gemini'],
                'engine-local': ['@ariontalk/engine-local'],
                core: ['@ariontalk/core'],
              },
            },
          }
        : {
            // NPM: left for the consumer's bundler to resolve.
            external: ['lit', /^lit\//, /^@lit\//, '@ariontalk/engine-gemini'],
            output: {
              entryFileNames: '[name].js',
            },
          }),
    },
  },
  server: {
    open: '/dev/index.html',
  },
});
