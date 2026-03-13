import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { GoogleGenAI, Modality } from '@google/genai';

const app = new Hono();

app.use('/api/token', cors());

const DEFAULT_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

app.post('/api/token', async (c) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not set');
    return c.json({ error: 'GEMINI_API_KEY not configured' }, 500);
  }

  try {
    const body = await c.req.json().catch(() => ({}));
    const { model: reqModel, voice } = body as Record<string, string | undefined>;

    const client = new GoogleGenAI({ apiKey, apiVersion: 'v1alpha' });

    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
        liveConnectConstraints: {
          model: reqModel || DEFAULT_MODEL,
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voice || 'Kore' },
              },
            },
          },
        },
      },
    });

    return c.json({ token: token.name });
  } catch (err) {
    console.error('Token creation failed:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

const port = parseInt(process.env.PORT || '3001', 10);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Token server running on http://localhost:${info.port}`);
});
