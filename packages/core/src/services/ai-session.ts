import type { SupportedLang } from '../types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ai-session');

/**
 * Wraps Chrome's Prompt API (LanguageModel / Gemini Nano) for on-device AI.
 */
export class AISessionService {
  private session: any = null;

  /** Whether the AI session is initialized and ready to accept prompts. */
  get isReady(): boolean {
    return this.session !== null;
  }

  /** Check if the Prompt API is available and the model is ready. */
  static async checkAvailability(): Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'> {
    try {
      const lm = (window as any).LanguageModel;
      if (!lm) return 'unavailable';
      const result = await lm.availability();
      log.debug('availability:', result);
      return result as 'available' | 'downloadable' | 'downloading' | 'unavailable';
    } catch {
      return 'unavailable';
    }
  }

  /** Creates a LanguageModel session with system prompt and page context. */
  async init(pageContext: string, lang: SupportedLang, onProgress?: (loaded: number) => void): Promise<void> {
    const lm = (window as any).LanguageModel;
    if (!lm) throw new Error('LanguageModel API not available');

    const { systemPrompt, initialPrompts } = this.buildPrompts(pageContext, lang);

    const langCode = lang === 'en' ? 'en' : 'es';
    const options: Record<string, any> = {
      systemPrompt,
      initialPrompts,
      expectedInputLanguages: [langCode],
      expectedOutputLanguages: [langCode],
    };

    if (onProgress) {
      options.monitor = (monitor: EventTarget) => {
        monitor.addEventListener('downloadprogress', (e: any) => {
          onProgress(e.loaded / e.total);
        });
      };
    }

    this.session = await lm.create(options);
    log.info('session ready');
  }

  /** Sends a user message and yields streaming response chunks. */
  async *prompt(userMessage: string, images?: Blob[]): AsyncGenerator<string> {
    if (!this.session) throw new Error('AI session not initialized');

    // Build content parts
    const content: any[] = [{ type: 'text', value: userMessage }];
    if (images?.length) {
      for (const img of images) {
        if (img.size > 0) {
          content.push({ type: 'image', value: img });
        }
      }
    }

    const promptInput = content.length === 1 ? userMessage : content;

    // Use prompt with streaming
    const stream = this.session.promptStreaming(promptInput);

    // Handle both accumulated (old API: each chunk = full text so far)
    // and incremental (new API: each chunk = only new text) streaming modes.
    let accumulated = '';
    for await (const chunk of stream) {
      const text = typeof chunk === 'string' ? chunk : String(chunk);
      if (!text) continue;

      if (text.startsWith(accumulated)) {
        // Accumulated mode: chunk contains full response so far
        const delta = text.slice(accumulated.length);
        if (delta) yield delta;
        accumulated = text;
      } else {
        // Incremental mode: chunk is just the new part
        yield text;
        accumulated += text;
      }
    }
  }

  /** Destroys the current session. */
  destroy(): void {
    if (this.session) {
      try { this.session.destroy(); } catch { /* ignore */ }
      this.session = null;
    }
  }

  private buildPrompts(pageContext: string, lang: SupportedLang) {
    const langName = lang === 'en' ? 'English' : 'Spanish';

    const systemPrompt = [
      'You are a spoken voice assistant embedded on a webpage. The user is talking to you through a microphone and you reply out loud.',
      `Respond in ${langName}. MAXIMUM 1-3 short sentences. No bullet points, no lists, no markdown, no emojis. Your response will be read aloud by a speech synthesizer, so write exactly as you would speak.`,
      'Answer using ONLY the page content the user provided. If the answer is not in the page content, say so briefly.',
      'For greetings like "hi" or "can you hear me", respond naturally and briefly, e.g. "Yes, I can hear you. Ask me anything about this page."',
    ].join(' ');

    const initialPrompts = [
      {
        role: 'user',
        content: `Here is the webpage I am on:\n\n${pageContext}`,
      },
      {
        role: 'assistant',
        content: lang === 'en'
          ? 'Got it. Ask me anything about this page.'
          : 'Entendido. Preguntame lo que quieras sobre esta pagina.',
      },
    ];

    return { systemPrompt, initialPrompts };
  }
}
