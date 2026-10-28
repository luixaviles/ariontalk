import type { SupportedLang } from '@ariontalk/core';
import { createLogger } from '@ariontalk/core';

const log = createLogger('ai-session');

export type PromptRuleKey = 'voice' | 'length' | 'grounding' | 'greetings' | 'acknowledgements' | 'tag' | 'images';

/** Narrow a session language to a code the on-device model is asked to use. */
function toLangCode(lang: SupportedLang): string {
  return lang === 'es' ? 'es' : 'en';
}

/** Language and modality hints shared by availability() and create(). */
function languageOptions(langCode: string, imageInput = false) {
  const inputs: any[] = [{ type: 'text', languages: [langCode] }];
  if (imageInput) {
    inputs.push({ type: 'image' });
  }
  return {
    expectedInputs: inputs,
    expectedOutputs: [{ type: 'text', languages: [langCode] }],
  };
}

/** Wraps Chrome's Prompt API (LanguageModel / Gemini Nano) for on-device AI. */
export class AISessionService {
  private session: any = null;

  /** Whether the AI session is initialized and ready to accept prompts. */
  get isReady(): boolean {
    return this.session !== null;
  }

  /** Check if the Prompt API is available and the model is ready. */
  static async checkAvailability(
    lang?: SupportedLang,
    opts?: { image?: boolean },
  ): Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'> {
    try {
      const lm = (window as any).LanguageModel;
      if (!lm) return 'unavailable';
      const langCode = lang ? toLangCode(lang) : 'en';
      const options = languageOptions(langCode, opts?.image ?? false);
      const result = await lm.availability(options);
      log.debug('availability:', result);
      return result as 'available' | 'downloadable' | 'downloading' | 'unavailable';
    } catch {
      return 'unavailable';
    }
  }

  /** Creates a LanguageModel session with system prompt, page context, and optional images. */
  async init(
    pageContext: string,
    lang: SupportedLang,
    onProgress?: (loaded: number) => void,
    options?: {
      interactiveHighlights?: boolean;
      images?: Array<{ id: string; source: ImageBitmapSource }>;
      /** Sampling params for reproducible runs. The Prompt API needs both or neither. */
      params?: { temperature: number; topK: number };
    },
  ): Promise<void> {
    const lm = (window as any).LanguageModel;
    if (!lm) throw new Error('LanguageModel API not available');

    const imageInput = (options?.images?.length ?? 0) > 0;
    const enableHighlights = options?.interactiveHighlights ?? false;

    const { systemPrompt, initialPrompts } = this.buildPrompts(
      pageContext,
      lang,
      enableHighlights,
      imageInput,
      options?.images,
    );

    // The Prompt API has no `systemPrompt` option. The system message must be
    // the first entry of `initialPrompts`, or it is silently dropped and none
    // of its instructions take effect.
    const optionsObj: Record<string, any> = {
      initialPrompts: [
        { role: 'system', content: systemPrompt },
        ...initialPrompts,
      ],
      ...languageOptions(toLangCode(lang), imageInput),
    };

    if (options?.params) {
      optionsObj.temperature = options.params.temperature;
      optionsObj.topK = options.params.topK;
    }

    if (onProgress) {
      optionsObj.monitor = (monitor: EventTarget) => {
        monitor.addEventListener('downloadprogress', (e: any) => {
          onProgress(e.loaded / e.total);
        });
      };
    }

    const safeReplacer = (k: string, v: unknown) => {
      if (k === 'monitor') return '[fn]';
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null || v === undefined) {
        return v;
      }
      if (Array.isArray(v) || (typeof v === 'object' && v !== null && v.constructor === Object)) {
        return v;
      }
      return '[image]';
    };
    log.debug('create() options:', JSON.stringify(optionsObj, safeReplacer));

    this.session = await lm.create(optionsObj);
    log.info('session ready');
  }

  /** Sends a user message and yields streaming response chunks. */
  async *prompt(userMessage: string): AsyncGenerator<string> {
    if (!this.session) throw new Error('AI session not initialized');

    const stream = this.session.promptStreaming(userMessage);

    // Handle both accumulated (old API: each chunk = full text so far)
    // and incremental (new API: each chunk = only new text) streaming modes.
    let accumulated = '';
    for await (const chunk of stream) {
      const text = typeof chunk === 'string' ? chunk : String(chunk);
      if (!text) continue;

      if (text.startsWith(accumulated)) {
        const delta = text.slice(accumulated.length);
        if (delta) yield delta;
        accumulated = text;
      } else {
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

  private buildPrompts(
    pageContext: string,
    lang: SupportedLang,
    enableHighlights = false,
    imageInput = false,
    images?: Array<{ id: string; source: ImageBitmapSource }>,
  ) {
    const langName = lang === 'en' ? 'English' : 'Spanish';

    // Countable limits are honored; "short" was not. The model obeyed the old
    // sentence cap while returning a 33-word sentence, so length is budgeted by
    // words and sentence shape is a hint only.
    const lengthRule = `Respond in ${langName}. Answer in under 40 words total. Prefer short, complete sentences.`;

    const groundingRule = imageInput
      ? 'Answer using the page content and the pictures the user shared with it. If the answer is not there, say so briefly.'
      : 'Answer using ONLY the page content the user provided. If the answer is not in the page content, say so briefly.';

    const sections: Array<{ key: PromptRuleKey; heading: string; content: string }> = [
      {
        key: 'voice',
        heading: '## Voice',
        content: 'You are ArionTalk, a voice agent that answers questions about the page the user is on. The user is talking to you through a microphone and you reply out loud.',
      },
      {
        key: 'length',
        heading: '## Length',
        content: lengthRule,
      },
      {
        key: 'grounding',
        heading: '## Grounding',
        content: groundingRule,
      },
      {
        key: 'greetings',
        heading: '## Greetings',
        content: 'For greetings like "hi" or "can you hear me", respond naturally and briefly, e.g. "Yes, I can hear you. Ask me anything about this page."',
      },
      {
        key: 'acknowledgements',
        heading: '## Acknowledgements',
        content: 'When the user reacts or thanks you instead of asking something, acknowledge briefly and invite the next question. Add no page content. Vary the wording, e.g. "Glad that helped. What else would you like to know?" or "Anytime. Anything else on this page?"',
      },
    ];

    if (enableHighlights) {
      sections.push({
        key: 'tag',
        heading: '## Highlight tag',
        content: [
          'The page content the user sends you marks each section with an ID like [sec-2] and each image with an ID like [img-1].',
          'When answering using page content, ALWAYS start your response with the matching tag: @@sec-2@@ for a section or @@img-1@@ for an image. The tag is removed before the text is spoken, so it is never read aloud.',
          'Use a tag only when the user asked a question about the page and your answer comes from one specific section or image. Never use a tag for greetings, acknowledgements or small talk, even if you mention what the page covers.',
          'Start your answer with the tag, then the answer itself, drawn from that section. The tag looks like this: "@@sec-2@@"',
          'If your answer is not tied to one specific section or image, or the topic is not on the page, start your response with @@none@@.',
        ].join(' '),
      });
    }

    if (imageInput && enableHighlights) {
      sections.push({
        key: 'images',
        heading: '## Images',
        content: [
          'The user shared some images as pictures right after the page text, each labeled with its ID. Describe an image only when the user explicitly asks about it, and then describe only what you see in it: objects, colors, layout, text. Otherwise answer from the page text and do not mention the images at all.',
          'Start your answer with the tag, then your description of that image. The tag looks like this: "@@img-1@@"',
          'Images marked "not attached" were not shared as pictures. Answer about those from their caption and say you cannot see them.',
        ].join(' '),
      });
    }

    const systemPrompt = sections.map((s) => `${s.heading}\n${s.content}`).join('\n\n');

    let userContent: any = `Here is the webpage I am on:\n\n${pageContext}`;
    if (imageInput && images && images.length > 0) {
      const content: any[] = [{ type: 'text', value: `Here is the webpage I am on:\n\n${pageContext}` }];
      content.push({ type: 'text', value: 'Attached images, each labeled with its ID:' });
      for (const img of images) {
        content.push({ type: 'text', value: `[${img.id}]` });
        content.push({ type: 'image', value: img.source });
      }
      userContent = content;
    }

    const initialPrompts = [
      {
        role: 'user',
        content: userContent,
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
