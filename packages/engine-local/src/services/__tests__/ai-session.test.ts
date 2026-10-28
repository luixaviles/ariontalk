import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AISessionService } from '../ai-session.js';

describe('AISessionService', () => {
  let fakeLM: any;
  let fakeSession: any;

  beforeEach(() => {
    fakeSession = {
      promptStreaming: vi.fn().mockReturnValue(
        (async function* () {
          yield 'Hello there!';
        })(),
      ),
      destroy: vi.fn(),
    };

    fakeLM = {
      availability: vi.fn().mockResolvedValue('available'),
      create: vi.fn().mockResolvedValue(fakeSession),
    };

    (window as any).LanguageModel = fakeLM;
  });

  afterEach(() => {
    delete (window as any).LanguageModel;
  });

  it('1. checkAvailability passes expectedInputs for text and image, returns unavailable on throw', async () => {
    await AISessionService.checkAvailability('en');
    expect(fakeLM.availability).toHaveBeenCalledWith({
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
    });

    fakeLM.availability.mockClear();
    await AISessionService.checkAvailability('en', { image: true });
    expect(fakeLM.availability).toHaveBeenCalledWith({
      expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
    });

    fakeLM.availability.mockRejectedValue(new Error('Hardware not supported'));
    const status = await AISessionService.checkAvailability('en', { image: true });
    expect(status).toBe('unavailable');
  });

  it('2. init with two images passes image expectedInputs and ordered user parts array', async () => {
    const service = new AISessionService();
    const fakeImg1 = { id: 'img-1' } as any;
    const fakeImg2 = { id: 'img-2' } as any;

    await service.init('Page text here', 'en', undefined, {
      interactiveHighlights: true,
      images: [
        { id: 'img-1', source: fakeImg1 },
        { id: 'img-2', source: fakeImg2 },
      ],
    });

    expect(fakeLM.create).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      }),
    );

    const callArgs = fakeLM.create.mock.calls[0][0];
    const userMessage = callArgs.initialPrompts[1];
    expect(userMessage.role).toBe('user');
    expect(Array.isArray(userMessage.content)).toBe(true);

    expect(userMessage.content).toEqual([
      { type: 'text', value: 'Here is the webpage I am on:\n\nPage text here' },
      { type: 'text', value: 'Attached images, each labeled with its ID:' },
      { type: 'text', value: '[img-1]' },
      { type: 'image', value: fakeImg1 },
      { type: 'text', value: '[img-2]' },
      { type: 'image', value: fakeImg2 },
    ]);
  });

  it('3. init with no images or empty array uses plain string and text-only expectedInputs', async () => {
    const service = new AISessionService();

    await service.init('Page text here', 'en', undefined, {
      interactiveHighlights: true,
      images: [],
    });

    const callArgs = fakeLM.create.mock.calls[0][0];
    expect(callArgs.expectedInputs).toEqual([{ type: 'text', languages: ['en'] }]);
    const userMessage = callArgs.initialPrompts[1];
    expect(typeof userMessage.content).toBe('string');
    expect(userMessage.content).toBe('Here is the webpage I am on:\n\nPage text here');
  });

  it('4. init rethrows create() rejection unchanged', async () => {
    const service = new AISessionService();
    fakeLM.create.mockRejectedValue(new Error('QuotaExceededError'));

    await expect(
      service.init('Page text', 'en', undefined, { images: [{ id: 'img-1', source: {} as any }] }),
    ).rejects.toThrow('QuotaExceededError');
  });

  it('5. prompt("hi") calls promptStreaming("hi")', async () => {
    const service = new AISessionService();
    await service.init('Page text', 'en');

    const chunks: string[] = [];
    for await (const chunk of service.prompt('hi')) {
      chunks.push(chunk);
    }

    expect(fakeSession.promptStreaming).toHaveBeenCalledWith('hi');
    expect(chunks.join('')).toBe('Hello there!');
  });

  it('6. system prompt wording depends on imageInput', async () => {
    const service1 = new AISessionService();
    await service1.init('Page text', 'en', undefined, {
      interactiveHighlights: true,
      images: [{ id: 'img-1', source: {} as any }],
    });

    const multimodalSys = fakeLM.create.mock.calls[0][0].initialPrompts[0].content;
    expect(multimodalSys).toContain('The user shared some images as pictures right after the page text, each labeled with its ID.');
    expect(multimodalSys).toContain('Start your answer with the tag, then your description of that image. The tag looks like this: "@@img-1@@"');
    expect(multimodalSys).not.toContain('<your description of that image>');
    expect(multimodalSys).not.toContain('<your answer drawn from that section>');
    expect(multimodalSys).not.toContain('ONLY');

    fakeLM.create.mockClear();
    const service2 = new AISessionService();
    await service2.init('Page text', 'en', undefined, {
      interactiveHighlights: true,
      images: [],
    });

    const textOnlySys = fakeLM.create.mock.calls[0][0].initialPrompts[0].content;
    expect(textOnlySys).toContain('Answer using ONLY the page content the user provided.');
    expect(textOnlySys).not.toContain('your description of that image');
    expect(textOnlySys).not.toContain('<your answer drawn from that section>');

    fakeLM.create.mockClear();
    const service3 = new AISessionService();
    await service3.init('Page text', 'en', undefined, {
      interactiveHighlights: false,
      images: [{ id: 'img-1', source: {} as any }],
    });

    const noHighlightsImgSys = fakeLM.create.mock.calls[0][0].initialPrompts[0].content;
    expect(noHighlightsImgSys).not.toContain('your description of that image');
  });

  it('7. options debug log does not throw when image part is a DOM element', async () => {
    const service = new AISessionService();
    const domImg = document.createElement('img');

    await expect(
      service.init('Page text', 'en', undefined, {
        images: [{ id: 'img-1', source: domImg }],
      }),
    ).resolves.not.toThrow();
  });

  it('8. system prompt eliminates prose examples, maintains tag mandate, and enforces negative image describe rule', async () => {
    const service = new AISessionService();
    await service.init('Page text', 'en', undefined, {
      interactiveHighlights: true,
      images: [{ id: 'img-1', source: {} as any }],
    });

    const sysPrompt = fakeLM.create.mock.calls[0][0].initialPrompts[0].content;

    // 1. No prose example survives
    expect(sysPrompt).not.toContain('red bicycle leaning against a white brick wall');
    expect(sysPrompt).not.toContain('Artificial intelligence refers to systems designed to perform tasks');
    expect(sysPrompt).not.toContain('<your description of that image>');
    expect(sysPrompt).not.toContain('<your answer drawn from that section>');

    // 2. The tag mandate is intact
    expect(sysPrompt).toContain('ALWAYS start your response with the matching');
    expect(sysPrompt).toContain('@@sec-');
    expect(sysPrompt).toContain('@@img-');

    // 3. The negative half is present
    expect(sysPrompt).toContain('only when the user explicitly asks');
    expect(sysPrompt).toContain('do not mention the images at all');

    // 4. No filler-phrase list anywhere, including as acknowledgement triggers.
    expect(sysPrompt.toLowerCase()).not.toContain('interesting');
    expect(sysPrompt.toLowerCase()).not.toContain("that's cool");

    // 5. The assistant is named once, in the voice rule, not in a section of its own.
    expect(sysPrompt).toContain("You are ArionTalk, a voice agent");
    expect(sysPrompt).not.toContain('## Identity');
  });

  it('9. system prompt scopes the tag mandate and forbids tags on conversational replies', async () => {
    const service = new AISessionService();
    await service.init('Page text', 'en', undefined, {
      interactiveHighlights: true,
      images: [{ id: 'img-1', source: {} as any }],
    });

    const sysPrompt = fakeLM.create.mock.calls[0][0].initialPrompts[0].content;

    // Length rule asserts 40 words budget and no numeric sentence limit
    expect(sysPrompt).toContain('Answer in under 40 words total. Prefer short, complete sentences.');
    expect(sysPrompt).not.toContain('two sentences');

    // The mandate is scoped to real questions rather than any use of page content.
    expect(sysPrompt).toContain('only when the user asked a question about the page');
    expect(sysPrompt).toContain('start your response with @@none@@');
    expect(sysPrompt).not.toContain('If your answer covers the page as a whole rather than one section, use no tag.');
    // Names the failure mode: a greeting that happens to mention page topics.
    expect(sysPrompt).toContain('Never use a tag for greetings, acknowledgements or small talk');
    expect(sysPrompt).toContain('even if you mention what the page covers');

    // Section headings are present.
    expect(sysPrompt).toContain('## Voice');
    expect(sysPrompt).toContain('## Length');
    expect(sysPrompt).not.toContain('## Markup');
    expect(sysPrompt).toContain('## Grounding');
    expect(sysPrompt).toContain('## Greetings');
    expect(sysPrompt).toContain('## Acknowledgements');
    expect(sysPrompt).toContain('## Highlight tag');
    expect(sysPrompt).toContain('## Images');

    // The mandate itself must survive; 775833b added it because tags were being omitted.
    expect(sysPrompt).toContain('ALWAYS start your response with the matching');

    // The greeting behavior this fix deliberately preserves.
    expect(sysPrompt).toContain('For greetings like "hi" or "can you hear me"');
  });

  it('10. init without params calls create() with no temperature and no topK keys', async () => {
    const service = new AISessionService();
    await service.init('Page text', 'en');

    expect(fakeLM.create).toHaveBeenCalledTimes(1);
    const callArgs = fakeLM.create.mock.calls[0][0];
    expect('temperature' in callArgs).toBe(false);
    expect('topK' in callArgs).toBe(false);
  });

  it('11. init with params forwards temperature and topK to create()', async () => {
    const service = new AISessionService();
    await service.init('Page text', 'en', undefined, {
      params: { temperature: 0, topK: 1 },
    });

    expect(fakeLM.create).toHaveBeenCalledTimes(1);
    const callArgs = fakeLM.create.mock.calls[0][0];
    expect(callArgs.temperature).toBe(0);
    expect(callArgs.topK).toBe(1);
  });

  it('12. prompt rules sentence set is preserved with newline structure', async () => {
    const service = new AISessionService();
    await service.init('Page text', 'en', undefined, {
      interactiveHighlights: true,
      images: [{ id: 'img-1', source: {} as any }],
    });

    const sysPrompt = fakeLM.create.mock.calls[0][0].initialPrompts[0].content;
    expect(sysPrompt).not.toContain('No bullet points');

    const expectedSentences = [
      'You are ArionTalk, a voice agent that answers questions about the page the user is on. The user is talking to you through a microphone and you reply out loud.',
      'Respond in English. Answer in under 40 words total. Prefer short, complete sentences.',
      'Answer using the page content and the pictures the user shared with it. If the answer is not there, say so briefly.',
      'For greetings like "hi" or "can you hear me", respond naturally and briefly, e.g. "Yes, I can hear you. Ask me anything about this page."',
      'When the user reacts or thanks you instead of asking something, acknowledge briefly and invite the next question. Add no page content. Vary the wording, e.g. "Glad that helped. What else would you like to know?" or "Anytime. Anything else on this page?"',
      'The page content the user sends you marks each section with an ID like [sec-2] and each image with an ID like [img-1].',
      'When answering using page content, ALWAYS start your response with the matching tag: @@sec-2@@ for a section or @@img-1@@ for an image. The tag is removed before the text is spoken, so it is never read aloud.',
      'Use a tag only when the user asked a question about the page and your answer comes from one specific section or image. Never use a tag for greetings, acknowledgements or small talk, even if you mention what the page covers.',
      'Start your answer with the tag, then the answer itself, drawn from that section. The tag looks like this: "@@sec-2@@"',
      'If your answer is not tied to one specific section or image, or the topic is not on the page, start your response with @@none@@.',
      'The user shared some images as pictures right after the page text, each labeled with its ID. Describe an image only when the user explicitly asks about it, and then describe only what you see in it: objects, colors, layout, text. Otherwise answer from the page text and do not mention the images at all.',
      'Start your answer with the tag, then your description of that image. The tag looks like this: "@@img-1@@"',
      'Images marked "not attached" were not shared as pictures. Answer about those from their caption and say you cannot see them.',
    ];

    for (const sentence of expectedSentences) {
      expect(sysPrompt).toContain(sentence);
    }
  });
});
