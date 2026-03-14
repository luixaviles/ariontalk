import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';
import { readFileSync } from 'fs';

/**
 * Vite plugin that serves ort-wasm-simd-threaded.mjs from .ort-wasm/.
 * ONNX Runtime loads this file via dynamic import(), which Vite blocks
 * from public/. This middleware serves it as a JS module instead.
 */
function serveOrtWasm(): Plugin {
  const ortWasmDir = resolve(__dirname, '.ort-wasm');
  return {
    name: 'serve-ort-wasm',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/ort-wasm-simd-threaded.mjs')) {
          const filePath = resolve(ortWasmDir, 'ort-wasm-simd-threaded.mjs');
          try {
            const content = readFileSync(filePath);
            res.setHeader('Content-Type', 'text/javascript');
            res.end(content);
          } catch {
            next();
          }
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [serveOrtWasm()],
  resolve: {
    alias: {
      '@ariontalk/core': resolve(__dirname, '../packages/core/src/index.ts'),
      '@ariontalk/widget': resolve(__dirname, '../packages/widget/src/index.ts'),
      '@ariontalk/plugin-silero-vad': resolve(__dirname, '../packages/plugin-silero-vad/src/index.ts'),
      '@ariontalk/engine-gemini': resolve(__dirname, '../packages/engine-gemini/src/index.ts'),
    },
  },
  optimizeDeps: {
    include: ['@ricky0123/vad-web'],
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        en: resolve(__dirname, 'en.html'),
        enAi: resolve(__dirname, 'en-ai.html'),
        es: resolve(__dirname, 'es.html'),
        esAi: resolve(__dirname, 'es-ai.html'),
        gemini: resolve(__dirname, 'gemini.html'),
      },
    },
  },
});
