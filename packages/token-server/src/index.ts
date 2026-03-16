import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { GoogleGenAI, Modality, Type, Behavior } from '@google/genai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_TEMPLATE = readFileSync(
  resolve(__dirname, './prompts/voice-assistant.md'), 'utf-8',
);

const app = new Hono();

app.use('/api/token', cors());

const DEFAULT_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

const LANG_DISPLAY_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', ja: 'Japanese', fr: 'French',
  de: 'German', pt: 'Portuguese', it: 'Italian', zh: 'Chinese',
  ko: 'Korean', hi: 'Hindi', ar: 'Arabic', ru: 'Russian',
};

const HIGHLIGHT_INSTRUCTIONS = `
## Interactive Highlighting

You have access to a \`highlight_and_scroll\` tool that scrolls the user's view to a specific section or image on the page and highlights it visually.

**Call \`highlight_and_scroll\` when you start discussing a specific section or image** with the element ID shown in brackets in the page content below (e.g. "sec-1", "img-2").

**Rules:**
- Call the tool ONCE when you begin discussing each element — do not repeat for the same element
- Only call it for specific sections or images, not for general page questions
- Do NOT verbally mention or reference the scrolling/highlighting in your speech
`;

const HIGHLIGHT_TOOL_DECLARATIONS = [{
  functionDeclarations: [{
    name: 'highlight_and_scroll',
    description: 'Scroll to and highlight a section or image on the page. Call this when you start discussing a specific section or image.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        elementId: { type: Type.STRING, description: 'Element ID like "sec-1" or "img-3"' },
      },
      required: ['elementId'],
    },
    behavior: Behavior.NON_BLOCKING,
  }],
}];

function buildSystemPrompt(
  pageContent: string,
  lang: string,
  pageTitle: string,
  pageUrl: string,
  interactiveHighlights: boolean,
): string {
  const langInstruction = lang === 'auto'
    ? 'Respond in the same language the user speaks'
    : `Respond in ${LANG_DISPLAY_NAMES[lang] ?? lang}`;

  return PROMPT_TEMPLATE
    .replace('{{lang}}', langInstruction)
    .replace('{{highlightInstructions}}', interactiveHighlights ? HIGHLIGHT_INSTRUCTIONS : '')
    .replace('{{pageTitle}}', pageTitle)
    .replace('{{pageUrl}}', pageUrl)
    .replace('{{pageContent}}', pageContent);
}

app.post('/api/token', async (c) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not set');
    return c.json({ error: 'GEMINI_API_KEY not configured' }, 500);
  }

  try {
    const body = await c.req.json().catch(() => ({}));
    const {
      model: reqModel,
      voice,
      lang,
      pageTitle,
      pageUrl,
      pageContent,
      interactiveHighlights,
    } = body as Record<string, string | boolean | undefined>;

    const highlights = interactiveHighlights === true;

    const systemInstruction = pageContent
      ? buildSystemPrompt(pageContent as string, (lang as string) || 'en', (pageTitle as string) || '', (pageUrl as string) || '', highlights)
      : undefined;

    const client = new GoogleGenAI({ apiKey, apiVersion: 'v1alpha' });

    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
        liveConnectConstraints: {
          model: (reqModel as string) || DEFAULT_MODEL,
          config: {
            ...(systemInstruction && { systemInstruction }),
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: (voice as string) || 'Kore' },
              },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            ...(highlights && { tools: HIGHLIGHT_TOOL_DECLARATIONS }),
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
