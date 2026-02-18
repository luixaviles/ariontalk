import type { SupportedLang } from '../types.js';

/**
 * Wraps Chrome's Prompt API (LanguageModel / Gemini Nano) for on-device AI.
 */
export class AISessionService {
  private session: any = null;

  /** Check if the Prompt API is available and the model is ready. */
  static async checkAvailability(): Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'> {
    try {
      const lm = (window as any).LanguageModel;
      if (!lm) return 'unavailable';
      const result = await lm.availability();
      return result as 'available' | 'downloadable' | 'downloading' | 'unavailable';
    } catch {
      return 'unavailable';
    }
  }

  /** Creates a LanguageModel session with system prompt and page context. */
  async init(pageContext: string, lang: SupportedLang): Promise<void> {
    const lm = (window as any).LanguageModel;
    if (!lm) throw new Error('LanguageModel API not available');

    const systemPrompt = this.buildSystemPrompt(pageContext, lang);

    this.session = await lm.create({
      systemPrompt,
      expectedInputLanguages: [lang === 'en' ? 'en' : 'es'],
    });
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

    // Use prompt with streaming
    const stream = this.session.promptStreaming(
      content.length === 1 ? userMessage : content,
    );

    let previousText = '';
    for await (const chunk of stream) {
      // The Prompt API streams the full accumulated text so far
      const newText = typeof chunk === 'string' ? chunk : String(chunk);
      if (newText.length > previousText.length) {
        yield newText.slice(previousText.length);
        previousText = newText;
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

  private buildSystemPrompt(pageContext: string, lang: SupportedLang): string {
    const langName = lang === 'en' ? 'English' : 'Spanish';
    return [
      'You are a helpful voice assistant embedded on a website. You answer questions about the current page content.',
      '',
      'Rules:',
      `- Always respond in ${langName} (${lang}).`,
      '- Keep responses concise (1-3 sentences) since they will be spoken aloud.',
      '- If asked about an image, describe what you see based on the provided image.',
      "- If you don't know something or the page content doesn't contain the answer, say so honestly.",
      "- Never make up information that isn't on the page.",
      '',
      'Current page content:',
      pageContext,
    ].join('\n');
  }
}
