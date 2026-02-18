import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/voice-chat-widget.ts'),
      formats: ['es'],
      fileName: 'voice-chat-widget',
    },
    target: 'es2021',
    minify: 'terser',
    rollupOptions: {
      output: {
        entryFileNames: 'voice-chat-widget.js',
      },
    },
  },
  server: {
    open: '/dev/index.html',
  },
});
