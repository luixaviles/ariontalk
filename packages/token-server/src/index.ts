import 'dotenv/config';
import { serve } from '@hono/node-server';
import { createTokenApp } from './app.js';

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});

const app = createTokenApp();
const port = parseInt(process.env.PORT || '3001', 10);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Token server running on http://localhost:${info.port}`);
});
