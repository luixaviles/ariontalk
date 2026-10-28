import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setLogLevel, LogLevel } from '@ariontalk/core';
import { VoiceEngine } from '../voice-engine.js';
import { preparePageImages } from '../../services/page-images.js';
import { AISessionService } from '../../services/ai-session.js';

vi.mock('../../services/page-images.js', () => ({
  preparePageImages: vi.fn().mockResolvedValue({ attached: [], skipped: [] }),
}));

describe('VoiceEngine with Interactive Highlights', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    document.body.innerHTML = `
      <main>
        <h1>Section 1</h1>
        <p>Text for section 1.</p>
        <h2>Section 2</h2>
        <p>Text for section 2.</p>
      </main>
    `;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('declares supportsInteractiveHighlights capability when enabled', () => {
    const engineWith = new VoiceEngine({ interactiveHighlights: true });
    expect(engineWith.capabilities.supportsInteractiveHighlights).toBe(true);
    engineWith.destroy();

    const engineWithout = new VoiceEngine({ interactiveHighlights: false });
    expect(engineWithout.capabilities.supportsInteractiveHighlights).toBe(false);
    engineWithout.destroy();
  });

  it('binds highlight execution to speech synthesis onStart callback', async () => {
    const engine = new VoiceEngine({ interactiveHighlights: true });

    // Mock AI session check & prompt
    vi.spyOn(engine['ai'].constructor as any, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);

    const onStartCallbacks: (Function | undefined)[] = [];
    vi.spyOn(engine['synthesis'], 'enqueue').mockImplementation((_text, _lang, opts) => {
      onStartCallbacks.push(opts?.onStart);
      return Promise.resolve();
    });

    const highlightSpy = vi.spyOn(engine['highlightManager']!, 'highlightElements');

    await engine.startSession('en');

    // Simulate streaming chunks from AI containing action tag
    const asyncGen = (async function* () {
      yield 'Here is the info. @@sec-1@@ Check this section.';
    })();
    vi.spyOn(engine['ai'], 'prompt').mockReturnValue(asyncGen as any);

    // Trigger transcript handling
    await engine['handleFinalTranscript']('tell me about section 1');

    // Every utterance carries an onStart so the engine can track playback
    // order; only the tagged one resolves to a highlight.
    const callbacks = onStartCallbacks.filter((cb) => typeof cb === 'function') as Function[];
    expect(callbacks.length).toBeGreaterThan(0);

    // At parse time (before speech start), highlightElements should NOT have been called yet
    expect(highlightSpy).not.toHaveBeenCalled();

    // Now trigger the onStart hook (simulating TTS starting to speak)
    callbacks.forEach((cb) => cb());

    expect(highlightSpy).toHaveBeenCalledTimes(1);
    const targetEls = highlightSpy.mock.calls[0][0];
    expect(targetEls.length).toBeGreaterThan(0);
    expect(targetEls[0].textContent).toContain('Section 1');

    engine.destroy();
  });

  it('handles markdown inside action tag brackets and strips tags from enqueue', async () => {
    const engine = new VoiceEngine({ interactiveHighlights: true });

    vi.spyOn(engine['ai'].constructor as any, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);

    const enqueuedTexts: string[] = [];
    vi.spyOn(engine['synthesis'], 'enqueue').mockImplementation((text) => {
      enqueuedTexts.push(text);
      return Promise.resolve();
    });

    await engine.startSession('en');

    const asyncGen = (async function* () {
      yield 'Here is @@**sec-2**@@ the feature.';
    })();
    vi.spyOn(engine['ai'], 'prompt').mockReturnValue(asyncGen as any);

    await engine['handleFinalTranscript']('tell me about section 2');

    expect(enqueuedTexts.some((t) => t.includes('@'))).toBe(false);

    engine.destroy();
  });

  it('reassembles tag split across streaming chunks and never passes [ to enqueue', async () => {
    const engine = new VoiceEngine({ interactiveHighlights: true });

    vi.spyOn(engine['ai'].constructor as any, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);

    const enqueuedTexts: string[] = [];
    const onStartCallbacks: (Function | undefined)[] = [];
    vi.spyOn(engine['synthesis'], 'enqueue').mockImplementation((text, _lang, opts) => {
      enqueuedTexts.push(text);
      onStartCallbacks.push(opts?.onStart);
      return Promise.resolve();
    });

    const highlightSpy = vi.spyOn(engine['highlightManager']!, 'highlightElements');

    await engine.startSession('en');

    const asyncGen = (async function* () {
      yield 'Here is section two. @';
      yield '@sec-2@@ Check it out.';
    })();
    vi.spyOn(engine['ai'], 'prompt').mockReturnValue(asyncGen as any);

    await engine['handleFinalTranscript']('tell me about section 2');

    expect(enqueuedTexts.some((t) => t.includes('@'))).toBe(false);

    // Every utterance carries an onStart so the engine can track playback
    // order; only the tagged one resolves to a highlight.
    const callbacks = onStartCallbacks.filter((cb) => typeof cb === 'function') as Function[];
    expect(callbacks.length).toBeGreaterThan(0);

    expect(highlightSpy).not.toHaveBeenCalled();
    callbacks.forEach((cb) => cb());
    expect(highlightSpy).toHaveBeenCalledTimes(1);

    engine.destroy();
  });

  it('drops partial tag when stream ends mid-tag without passing [ to enqueue', async () => {
    const engine = new VoiceEngine({ interactiveHighlights: true });

    vi.spyOn(engine['ai'].constructor as any, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);

    const enqueuedTexts: string[] = [];
    vi.spyOn(engine['synthesis'], 'enqueue').mockImplementation((text) => {
      enqueuedTexts.push(text);
      return Promise.resolve();
    });

    await engine.startSession('en');

    const asyncGen = (async function* () {
      yield 'Here is section info. @@sec-1';
    })();
    vi.spyOn(engine['ai'], 'prompt').mockReturnValue(asyncGen as any);

    await engine['handleFinalTranscript']('tell me about section 1');

    expect(enqueuedTexts.some((t) => t.includes('@'))).toBe(false);
    expect(enqueuedTexts).toContain('Here is section info.');

    engine.destroy();
  });

  it('fires highlight when the model emits a trailing tag-only fragment', async () => {
    const engine = new VoiceEngine({ interactiveHighlights: true });

    vi.spyOn(engine['ai'].constructor as any, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);

    const enqueuedTexts: string[] = [];
    const onStartCallbacks: (Function | undefined)[] = [];
    vi.spyOn(engine['synthesis'], 'enqueue').mockImplementation((text, _lang, opts) => {
      enqueuedTexts.push(text);
      onStartCallbacks.push(opts?.onStart);
      return Promise.resolve();
    });

    const highlightSpy = vi.spyOn(engine['highlightManager']!, 'highlightElements');

    await engine.startSession('en');

    // Reproduces observed Gemini Nano output: tag trails the final sentence.
    const asyncGen = (async function* () {
      yield 'Web Components are lightweight. A Lit component adds about 5KB. @@sec-2@@';
    })();
    vi.spyOn(engine['ai'], 'prompt').mockReturnValue(asyncGen as any);

    await engine['handleFinalTranscript']('tell me about section 2');

    expect(enqueuedTexts.some((t) => t.includes('@'))).toBe(false);
    expect(enqueuedTexts.length).toBeGreaterThan(0);

    // The trailing tag binds to the last utterance rather than being dropped.
    const cbs = onStartCallbacks.filter((cb) => typeof cb === 'function') as Function[];
    cbs.forEach((cb) => cb());
    expect(highlightSpy).toHaveBeenCalled();
    expect((highlightSpy.mock.calls[0][0] as any)[0].textContent).toContain('Section 2');

    engine.destroy();
  });

  it('starts listening right after the greeting when the model only needs warming', async () => {
    const engine = new VoiceEngine();

    const order: string[] = [];
    let resolveInit: () => void = () => {};
    vi.spyOn(engine['ai'].constructor as any, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['ai'], 'init').mockImplementation(
      () => new Promise<void>((r) => { resolveInit = () => r(); }),
    );

    vi.spyOn(engine['synthesis'], 'enqueue').mockImplementation((text) => {
      order.push('speak:' + text);
      return Promise.resolve();
    });
    vi.spyOn(engine['recognition'], 'start').mockImplementation(() => {
      order.push('listen');
    });

    const started = engine.startSession('en');
    await new Promise((r) => setTimeout(r, 0));

    // Greeting is spoken first, and listening starts before ai.init() resolves
    expect(order[0]).toMatch(/^speak:/);
    expect(order).toContain('listen');
    expect(engine.state.status).toBe('listening');

    resolveInit();
    await started;

    expect(order).toContain('listen');
    expect(engine.state.status).toBe('listening');

    engine.destroy();
  });

  it('download still blocks: shows loading/ai after greeting until model resolves', async () => {
    const engine = new VoiceEngine();

    const order: string[] = [];
    let resolveInit: () => void = () => {};
    vi.spyOn(engine['ai'].constructor as any, 'checkAvailability').mockResolvedValue('downloadable');
    vi.spyOn(engine['ai'], 'init').mockImplementation(
      () => new Promise<void>((r) => { resolveInit = () => r(); }),
    );

    vi.spyOn(engine['synthesis'], 'enqueue').mockImplementation((text) => {
      order.push('speak:' + text);
      return Promise.resolve();
    });
    vi.spyOn(engine['recognition'], 'start').mockImplementation(() => {
      order.push('listen');
    });

    const started = engine.startSession('en');
    await new Promise((r) => setTimeout(r, 0));

    // Greeting is spoken before ai.init() resolves, but download blocks listening
    expect(order[0]).toMatch(/^speak:/);
    expect(order).not.toContain('listen');
    expect(engine.state.status).toBe('loading');
    expect(engine.state.loadingStage).toBe('ai');

    resolveInit();
    await started;

    expect(order).toContain('listen');
    expect(engine.state.status).toBe('listening');

    engine.destroy();
  });

  it('an early transcript waits and is answered once model warm-up finishes', async () => {
    const engine = new VoiceEngine();
    let resolveInit: () => void = () => {};
    let modelReady = false;

    vi.spyOn(AISessionService, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['ai'], 'init').mockImplementation(
      () =>
        new Promise<void>((r) => {
          resolveInit = () => {
            modelReady = true;
            r();
          };
        }),
    );
    vi.spyOn(engine['ai'], 'isReady', 'get').mockImplementation(() => modelReady);
    vi.spyOn(engine['synthesis'], 'enqueue').mockResolvedValue(undefined);
    vi.spyOn(engine['recognition'], 'start').mockImplementation(() => {});
    vi.spyOn(engine['recognition'], 'pause').mockImplementation(() => {});
    vi.spyOn(engine['recognition'], 'resume').mockImplementation(() => {});

    const promptSpy = vi.spyOn(engine['ai'], 'prompt').mockReturnValue(
      (async function* () {
        yield 'Hello! How can I help?';
      })() as any,
    );

    await engine.startSession('en');
    expect(engine.state.status).toBe('listening');
    expect(modelReady).toBe(false);

    const turnPromise = engine['handleFinalTranscript']('hello');
    await new Promise((r) => setTimeout(r, 0));

    // Early transcript waits in thinking state without error; prompt not called yet
    expect(engine.state.status).toBe('thinking');
    expect(engine.state.error).toBeNull();
    expect(promptSpy).not.toHaveBeenCalled();

    // Model finishes warm-up
    resolveInit();
    await turnPromise;

    expect(promptSpy).toHaveBeenCalledWith('hello');
    expect(engine.state.error).toBeNull();
    expect(engine.state.status).toBe('listening');

    engine.destroy();
  });

  it('a failed init after waiting surfaces an error and does not proceed', async () => {
    const engine = new VoiceEngine();
    let rejectInit: (err: any) => void = () => {};

    vi.spyOn(AISessionService, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['ai'], 'init').mockImplementation(
      () =>
        new Promise<void>((_, reject) => {
          rejectInit = () => reject(new Error('Model load failure'));
        }),
    );
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(false);
    vi.spyOn(engine['synthesis'], 'enqueue').mockResolvedValue(undefined);
    vi.spyOn(engine['recognition'], 'start').mockImplementation(() => {});
    vi.spyOn(engine['recognition'], 'pause').mockImplementation(() => {});

    const promptSpy = vi.spyOn(engine['ai'], 'prompt');

    await engine.startSession('en');
    expect(engine.state.status).toBe('listening');

    const turnPromise = engine['handleFinalTranscript']('hello');
    await new Promise((r) => setTimeout(r, 0));

    expect(engine.state.status).toBe('thinking');
    expect(engine.state.error).toBeNull();

    rejectInit(new Error('Model load failure'));
    await turnPromise;

    expect(engine.state.status).toBe('error');
    expect(engine.state.error).toBe('AI model is unavailable. Please try again.');
    expect(promptSpy).not.toHaveBeenCalled();

    engine.destroy();
  });

  it('language switch retargets aiReady so early transcript waits for new init', async () => {
    const engine = new VoiceEngine();
    vi.spyOn(AISessionService, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['synthesis'], 'enqueue').mockResolvedValue(undefined);
    vi.spyOn(engine['recognition'], 'start').mockImplementation(() => {});
    vi.spyOn(engine['recognition'], 'pause').mockImplementation(() => {});
    vi.spyOn(engine['recognition'], 'resume').mockImplementation(() => {});

    let isReady = true;
    vi.spyOn(engine['ai'], 'isReady', 'get').mockImplementation(() => isReady);
    vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);
    vi.spyOn(engine['ai'], 'destroy').mockImplementation(() => {
      isReady = false;
    });

    const promptSpy = vi.spyOn(engine['ai'], 'prompt').mockReturnValue(
      (async function* () {
        yield 'Respuesta en español';
      })() as any,
    );

    await engine.startSession('en');
    expect(engine.state.status).toBe('listening');

    // Pending re-init for language switch
    let resolveReinit: () => void = () => {};
    vi.spyOn(engine['ai'], 'init').mockImplementation(
      () =>
        new Promise<void>((r) => {
          resolveReinit = () => {
            isReady = true;
            r();
          };
        }),
    );

    engine.switchLanguage('es');

    const turnPromise = engine['handleFinalTranscript']('hola');
    await new Promise((r) => setTimeout(r, 0));

    // Must wait for new init, not resolve immediately against stale startSession promise
    expect(engine.state.status).toBe('thinking');
    expect(engine.state.error).toBeNull();
    expect(promptSpy).not.toHaveBeenCalled();

    resolveReinit();
    await turnPromise;

    expect(promptSpy).toHaveBeenCalledWith('hola');
    expect(engine.state.error).toBeNull();
    expect(engine.state.status).toBe('listening');

    engine.destroy();
  });

  it('blocks for a download even when availability resolves after the greeting', async () => {
    const engine = new VoiceEngine();
    // Verdict lands late; the gate must wait for it rather than defaulting to "no download".
    vi.spyOn(AISessionService, 'checkAvailability').mockImplementation(
      () => new Promise((r) => setTimeout(() => r('downloadable' as any), 50)),
    );
    let resolveInit: () => void = () => {};
    let ready = false;
    vi.spyOn(engine['ai'], 'init').mockImplementation(
      () => new Promise<void>((r) => { resolveInit = () => { ready = true; r(); }; }),
    );
    vi.spyOn(engine['ai'], 'isReady', 'get').mockImplementation(() => ready);
    vi.spyOn(engine['synthesis'], 'enqueue').mockResolvedValue(undefined);
    const startSpy = vi.spyOn(engine['recognition'], 'start').mockImplementation(() => {});

    const started = engine.startSession('en');
    await new Promise((r) => setTimeout(r, 80));

    expect(engine.state.status).toBe('loading');
    expect(engine.state.loadingStage).toBe('ai');
    expect(startSpy).not.toHaveBeenCalled();

    resolveInit();
    await started;
    expect(engine.state.status).toBe('listening');

    engine.destroy();
  });

  it('language switch re-resolves availability and forwards a progress hook', async () => {
    const engine = new VoiceEngine();
    let ready = true;
    const avail = vi.spyOn(AISessionService, 'checkAvailability').mockResolvedValue('available');
    const initSpy = vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);
    vi.spyOn(engine['ai'], 'isReady', 'get').mockImplementation(() => ready);
    vi.spyOn(engine['ai'], 'destroy').mockImplementation(() => { ready = false; });
    vi.spyOn(engine['synthesis'], 'enqueue').mockResolvedValue(undefined);
    vi.spyOn(engine['recognition'], 'start').mockImplementation(() => {});
    vi.spyOn(engine['recognition'], 'pause').mockImplementation(() => {});

    await engine.startSession('en');
    expect(engine['aiNeedsDownload']).toBe(false);

    // The new language needs its own download; the stale verdict must not win.
    avail.mockResolvedValue('downloadable' as any);
    initSpy.mockClear();
    engine.switchLanguage('es');
    await new Promise((r) => setTimeout(r, 0));

    expect(engine['aiNeedsDownload']).toBe(true);
    expect(typeof initSpy.mock.calls[0][2]).toBe('function');

    engine.destroy();
  });

  it('greeting waits for synthesis.init when a plugin will serve the language', async () => {
    const mockSynth = {
      id: 'plugin-tts',
      isReady: true,
      init: vi.fn().mockImplementation(() => new Promise((r) => setTimeout(r, 20))),
      supportsLang: vi.fn().mockReturnValue(true),
      enqueue: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(),
      getVoices: vi.fn().mockReturnValue([]),
      applyVoiceSettings: vi.fn(),
      getVoiceOverrides: vi.fn().mockReturnValue(null),
      destroy: vi.fn(),
    };
    const engine = new VoiceEngine({ synthesizer: mockSynth });

    vi.spyOn(engine['ai'].constructor as any, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);

    const order: string[] = [];
    vi.spyOn(mockSynth, 'init').mockImplementation(async () => {
      order.push('synth-init');
    });
    vi.spyOn(engine['synthesis'], 'enqueue').mockImplementation((text) => {
      order.push('speak:' + text);
      return Promise.resolve();
    });

    await engine.startSession('en');

    expect(order[0]).toBe('synth-init');
    expect(order[1]).toMatch(/^speak:/);

    engine.destroy();
  });

  it('greeting does not wait for synthesis.init when the plugin cannot serve the language', async () => {
    const mockSynth = {
      id: 'plugin-tts',
      isReady: true,
      init: vi.fn().mockResolvedValue(undefined),
      supportsLang: vi.fn().mockReturnValue(false),
      enqueue: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(),
      getVoices: vi.fn().mockReturnValue([]),
      applyVoiceSettings: vi.fn(),
      getVoiceOverrides: vi.fn().mockReturnValue(null),
      destroy: vi.fn(),
    };
    const engine = new VoiceEngine({ synthesizer: mockSynth });

    vi.spyOn(engine['ai'].constructor as any, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);

    const synthInitSpy = vi.spyOn(mockSynth, 'init');
    await engine.startSession('es');

    expect(synthInitSpy).not.toHaveBeenCalled();

    engine.destroy();
  });

  it('barge-in is not armed until an onStart fires', async () => {
    const mockBargeIn = {
      init: vi.fn().mockResolvedValue(undefined),
      startMonitoring: vi.fn(),
      stopMonitoring: vi.fn(),
      destroy: vi.fn(),
    };
    const engine = new VoiceEngine({ bargeInDetector: mockBargeIn });

    vi.spyOn(engine['ai'].constructor as any, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);

    let onStartCb: (() => void) | undefined;
    vi.spyOn(engine['synthesis'], 'enqueue').mockImplementation((_text, _lang, opts) => {
      onStartCb = opts?.onStart;
      return Promise.resolve();
    });

    await engine.startSession('en');

    expect(mockBargeIn.startMonitoring).not.toHaveBeenCalled();

    onStartCb?.();
    expect(mockBargeIn.startMonitoring).toHaveBeenCalledTimes(1);

    engine.destroy();
  });

  it('greets in Spanish when greetingLang is es', async () => {
    const engine = new VoiceEngine();
    vi.spyOn(engine['ai'].constructor as any, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);

    const spoken: string[] = [];
    vi.spyOn(engine['synthesis'], 'enqueue').mockImplementation((text) => {
      spoken.push(text);
      return Promise.resolve();
    });
    vi.spyOn(engine['recognition'], 'start').mockImplementation(() => {});

    await engine.startSession('auto', { greetingLang: 'es' });
    await new Promise((r) => setTimeout(r, 0));

    expect(spoken[0]).toContain('Hola');
    engine.destroy();
  });

  it('greets in Spanish when lang is es, ignoring greetingLang en', async () => {
    const engine = new VoiceEngine();
    vi.spyOn(engine['ai'].constructor as any, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);

    const spoken: string[] = [];
    vi.spyOn(engine['synthesis'], 'enqueue').mockImplementation((text) => {
      spoken.push(text);
      return Promise.resolve();
    });
    vi.spyOn(engine['recognition'], 'start').mockImplementation(() => {});

    await engine.startSession('es', { greetingLang: 'en' });
    await new Promise((r) => setTimeout(r, 0));

    expect(spoken[0]).toContain('Hola');
    engine.destroy();
  });

  it('terminal error (speech-local-unavailable) does not auto-dismiss or restart recognition', async () => {
    vi.useFakeTimers();
    const engine = new VoiceEngine();
    engine['sessionActive'] = true;
    const startSpy = vi.spyOn(engine['recognition'], 'start').mockImplementation(() => {});

    // Trigger terminal error
    engine['recognition'].onError?.('speech-local-unavailable');
    expect(engine.state.status).toBe('error');
    expect(engine.state.error).toBe('On-device speech recognition is not available on this device.');

    // Fast-forward past 5 seconds (auto-dismiss is normally 3s)
    await vi.advanceTimersByTimeAsync(5000);

    expect(engine.state.status).toBe('error');
    expect(startSpy).not.toHaveBeenCalled();

    // In contrast, non-terminal error in a fresh session auto-dismisses after 3s
    engine.endSession();
    engine['sessionActive'] = true;
    engine['recognition'].onError?.('network');
    expect(engine.state.status).toBe('error');
    await vi.advanceTimersByTimeAsync(3500);
    expect(engine.state.status).toBe('listening');

    vi.useRealTimers();
    engine.destroy();
  });

  it('a voice load served from memory never shows a bar', async () => {
    const mockSynth: any = {
      id: 'plugin-tts', isReady: true,
      // Simulates in-memory cache hit
      init: vi.fn().mockImplementation(async (onProgress: any) => {
        onProgress?.(1);
        onProgress?.(-1);
      }),
      supportsLang: () => true,
      enqueue: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(), getVoices: () => [], applyVoiceSettings: vi.fn(),
      getVoiceOverrides: () => null, destroy: vi.fn(),
    };
    const engine = new VoiceEngine({ synthesizer: mockSynth });
    vi.spyOn(engine['ai'].constructor as any, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);
    vi.spyOn(engine['recognition'], 'start').mockImplementation(() => {});

    const voiceSamples: number[] = [];
    engine.onStateChange = (s) => {
      if (s.status === 'loading' && s.loadingStage === 'voice') voiceSamples.push(s.downloadProgress);
    };

    await engine.startSession('en');

    expect(voiceSamples.every((p) => p === 0)).toBe(true);
    engine.destroy();
  });

  it('a real voice download reports its fraction, then goes indeterminate while it prepares', async () => {
    const mockSynth: any = {
      id: 'plugin-tts', isReady: true,
      init: vi.fn().mockImplementation(async (onProgress: any) => {
        onProgress?.(-1);   // load starts, nothing measured yet
        onProgress?.(0.4);  // bytes moving
        onProgress?.(1);    // download done
        onProgress?.(-1);   // warmup
      }),
      supportsLang: () => true,
      enqueue: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(), getVoices: () => [], applyVoiceSettings: vi.fn(),
      getVoiceOverrides: () => null, destroy: vi.fn(),
    };
    const engine = new VoiceEngine({ synthesizer: mockSynth });
    vi.spyOn(engine['ai'].constructor as any, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);
    vi.spyOn(engine['recognition'], 'start').mockImplementation(() => {});

    const voiceSamples: number[] = [];
    engine.onStateChange = (s) => {
      if (s.status === 'loading' && s.loadingStage === 'voice') voiceSamples.push(s.downloadProgress);
    };

    await engine.startSession('en');

    expect(voiceSamples).toEqual([0, 0, 0.4, -1, -1]);
    engine.destroy();
  });

  it('a voice load that reports nothing for too long falls back to an indeterminate bar', async () => {
    vi.useFakeTimers();
    let finishInit: () => void = () => {};
    const mockSynth: any = {
      id: 'plugin-tts', isReady: true,
      // Simulates unmeasured download (no progress emitted)
      init: vi.fn().mockImplementation(() => new Promise<void>((r) => { finishInit = r; })),
      supportsLang: () => true,
      enqueue: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(), getVoices: () => [], applyVoiceSettings: vi.fn(),
      getVoiceOverrides: () => null, destroy: vi.fn(),
    };
    const engine = new VoiceEngine({ synthesizer: mockSynth });
    vi.spyOn(engine['ai'].constructor as any, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);
    vi.spyOn(engine['recognition'], 'start').mockImplementation(() => {});

    const started = engine.startSession('en');
    await vi.advanceTimersByTimeAsync(500);
    expect(engine.state.downloadProgress).toBe(0);

    await vi.advanceTimersByTimeAsync(1200);
    expect(engine.state.downloadProgress).toBe(-1);

    finishInit();
    await started;
    engine.destroy();
    vi.useRealTimers();
  });

  it('AI download progress does not write the bar while the voice stage owns it', async () => {
    const mockSynth: any = {
      id: 'plugin-tts', isReady: true,
      init: vi.fn().mockImplementation(() => new Promise((r) => setTimeout(r, 50))),
      supportsLang: () => true,
      enqueue: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(), getVoices: () => [], applyVoiceSettings: vi.fn(),
      getVoiceOverrides: () => null, destroy: vi.fn(),
    };
    const engine = new VoiceEngine({ synthesizer: mockSynth });
    vi.spyOn(engine['ai'].constructor as any, 'checkAvailability').mockResolvedValue('downloadable');
    vi.spyOn(engine['ai'], 'init').mockImplementation(async (_p: any, _l: any, onProgress: any) => {
      onProgress?.(0.42);            // Nano reports while the voice model is still loading
      await new Promise((r) => setTimeout(r, 5));
    });
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);
    vi.spyOn(engine['recognition'], 'start').mockImplementation(() => {});

    const seen: Array<[string | undefined, number]> = [];
    engine.onStateChange = (s) => {
      if (s.status === 'loading') seen.push([s.loadingStage, s.downloadProgress]);
    };

    await engine.startSession('en');

    expect(seen.some(([stage, p]) => stage === 'voice' && p === 0.42)).toBe(false);
    engine.destroy();
  });

  it('switchLanguage with rejecting synthesis.init does not produce an unhandled rejection', async () => {
    const mockSynth: any = {
      id: 'plugin-tts', isReady: false,
      init: vi.fn().mockRejectedValue(new Error('TTS load failed')),
      supportsLang: (l: string) => l === 'en',
      enqueue: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(), getVoices: () => [], applyVoiceSettings: vi.fn(),
      getVoiceOverrides: () => null, destroy: vi.fn(),
    };
    const engine = new VoiceEngine({ synthesizer: mockSynth });
    vi.spyOn(engine['ai'].constructor as any, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);
    vi.spyOn(engine['recognition'], 'start').mockImplementation(() => {});
    vi.spyOn(engine['recognition'], 'setLanguage').mockImplementation(() => {});

    await engine.startSession('es');

    expect(() => engine.switchLanguage('en')).not.toThrow();
    await vi.waitFor(() => expect(mockSynth.init).toHaveBeenCalled());

    engine.destroy();
  });

  it('displays welcome greeting captions progressively on onStart and clears on greeting completion', async () => {
    const engine = new VoiceEngine();
    vi.spyOn(engine['ai'].constructor as any, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);
    vi.spyOn(engine['recognition'], 'start').mockImplementation(() => {});

    let onStartCb: ((meta?: { durationMs?: number }) => void) | undefined;
    let resolveEnqueue: () => void = () => {};
    vi.spyOn(engine['synthesis'], 'enqueue').mockImplementation((_text, _lang, opts) => {
      onStartCb = opts?.onStart;
      return new Promise<void>((resolve) => {
        resolveEnqueue = resolve;
      });
    });

    const started = engine.startSession('en');
    await new Promise((r) => setTimeout(r, 0));

    expect(engine.state.interimTranscript).toBe('');

    onStartCb?.({ durationMs: 2000 });
    expect(engine.state.interimTranscript).toBe('Hi.');

    resolveEnqueue();
    await started;

    expect(engine.state.interimTranscript).toBe('');
    engine.destroy();
  });

  it('accumulates turn captions across multiple sentences on each onStart and clears on turn end', async () => {
    const engine = new VoiceEngine();
    vi.spyOn(engine['ai'].constructor as any, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);
    vi.spyOn(engine['recognition'], 'start').mockImplementation(() => {});
    vi.spyOn(engine['recognition'], 'pause').mockImplementation(() => {});
    vi.spyOn(engine['recognition'], 'resume').mockImplementation(() => {});

    const onStartCallbacks: (((meta?: { durationMs?: number }) => void) | undefined)[] = [];
    const resolvers: (() => void)[] = [];
    vi.spyOn(engine['synthesis'], 'enqueue').mockImplementation((text, _lang, opts) => {
      if (text.startsWith('Hi.')) return Promise.resolve();
      if (opts?.onStart) onStartCallbacks.push(opts.onStart);
      return new Promise<void>((resolve) => {
        resolvers.push(resolve);
      });
    });

    await engine.startSession('en');

    const asyncGen = (async function* () {
      yield 'First sentence. ';
      yield 'Second sentence.';
    })();
    vi.spyOn(engine['ai'], 'prompt').mockReturnValue(asyncGen as any);

    const turnPromise = engine['handleFinalTranscript']('hello');
    await new Promise((r) => setTimeout(r, 0));

    expect(onStartCallbacks.length).toBe(2);

    onStartCallbacks[0]!({ durationMs: 2000 });
    expect(engine.state.interimTranscript).toBe('First');
    resolvers[0]();
    await new Promise((r) => setTimeout(r, 0));

    onStartCallbacks[1]!({ durationMs: 2000 });
    expect(engine.state.interimTranscript).toBe('First sentence. Second');
    resolvers[1]();
    await new Promise((r) => setTimeout(r, 0));

    await turnPromise;
    expect(engine.state.interimTranscript).toBe('');
    expect(engine.state.status).toBe('listening');

    engine.destroy();
  });

  it('clears interimTranscript immediately on barge-in during speech playback', async () => {
    const engine = new VoiceEngine();
    vi.spyOn(engine['ai'].constructor as any, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);
    vi.spyOn(engine['recognition'], 'start').mockImplementation(() => {});
    vi.spyOn(engine['recognition'], 'pause').mockImplementation(() => {});
    vi.spyOn(engine['recognition'], 'resume').mockImplementation(() => {});

    let onStartCb: (((meta?: { durationMs?: number }) => void) | undefined);
    let resolveEnqueue: () => void = () => {};
    vi.spyOn(engine['synthesis'], 'enqueue').mockImplementation((text, _lang, opts) => {
      if (text.startsWith('Hi.')) return Promise.resolve();
      onStartCb = opts?.onStart;
      return new Promise<void>((resolve) => {
        resolveEnqueue = resolve;
      });
    });
    vi.spyOn(engine['synthesis'], 'cancel').mockImplementation(() => {
      resolveEnqueue();
    });

    await engine.startSession('en');

    const asyncGen = (async function* () {
      yield 'This is a long sentence being spoken.';
    })();
    vi.spyOn(engine['ai'], 'prompt').mockReturnValue(asyncGen as any);

    const turnPromise = engine['handleFinalTranscript']('tell me something');
    await new Promise((r) => setTimeout(r, 0));

    onStartCb?.({ durationMs: 3000 });
    expect(engine.state.interimTranscript).toBe('This');

    engine['handleBargeIn']();
    expect(engine.state.interimTranscript).toBe('');

    resolveEnqueue();
    await turnPromise;
    engine.destroy();
  });

  it('displays captions when interactiveHighlights is false', async () => {
    const engine = new VoiceEngine({ interactiveHighlights: false });
    vi.spyOn(engine['ai'].constructor as any, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);
    vi.spyOn(engine['recognition'], 'start').mockImplementation(() => {});
    vi.spyOn(engine['recognition'], 'pause').mockImplementation(() => {});
    vi.spyOn(engine['recognition'], 'resume').mockImplementation(() => {});

    let onStartCb: (((meta?: { durationMs?: number }) => void) | undefined);
    let resolveEnqueue: () => void = () => {};
    vi.spyOn(engine['synthesis'], 'enqueue').mockImplementation((text, _lang, opts) => {
      if (text.startsWith('Hi.')) return Promise.resolve();
      onStartCb = opts?.onStart;
      return new Promise<void>((resolve) => {
        resolveEnqueue = resolve;
      });
    });

    await engine.startSession('en');

    const asyncGen = (async function* () {
      yield 'Highlights are disabled but captions work.';
    })();
    vi.spyOn(engine['ai'], 'prompt').mockReturnValue(asyncGen as any);

    const turnPromise = engine['handleFinalTranscript']('test');
    await new Promise((r) => setTimeout(r, 0));

    onStartCb?.({ durationMs: 2000 });
    expect(engine.state.interimTranscript).toBe('Highlights');

    resolveEnqueue();
    await turnPromise;
    expect(engine.state.interimTranscript).toBe('');

    engine.destroy();
  });

  it('11. Kokoro ordering: second sentence onStart in same tick does not lose first sentence', async () => {
    const engine = new VoiceEngine();
    vi.spyOn(engine['ai'].constructor as any, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);
    vi.spyOn(engine['recognition'], 'start').mockImplementation(() => {});
    vi.spyOn(engine['recognition'], 'pause').mockImplementation(() => {});
    vi.spyOn(engine['recognition'], 'resume').mockImplementation(() => {});

    const onStarts: ((meta?: { durationMs?: number }) => void)[] = [];
    const resolvers: (() => void)[] = [];
    vi.spyOn(engine['synthesis'], 'enqueue').mockImplementation((text, _lang, opts) => {
      if (text.startsWith('Hi.')) return Promise.resolve();
      if (opts?.onStart) onStarts.push(opts.onStart);
      return new Promise<void>((resolve) => resolvers.push(resolve));
    });

    await engine.startSession('en');

    const asyncGen = (async function* () {
      yield 'First sentence here. ';
      yield 'Second sentence there.';
    })();
    vi.spyOn(engine['ai'], 'prompt').mockReturnValue(asyncGen as any);

    const turnPromise = engine['handleFinalTranscript']('hello');
    await new Promise((r) => setTimeout(r, 0));

    expect(onStarts.length).toBe(2);

    onStarts[0]({ durationMs: 2000 });
    expect(engine.state.interimTranscript).toBe('First');

    resolvers[0]();
    onStarts[1]({ durationMs: 2000 });
    expect(engine.state.interimTranscript).toBe('First sentence here. Second');

    await new Promise((r) => setTimeout(r, 0));
    expect(engine.state.interimTranscript).toBe('First sentence here. Second');

    resolvers[1]();
    await turnPromise;
    expect(engine.state.interimTranscript).toBe('');
    engine.destroy();
  });

  it('12. Barge-in mid-sentence clears interimTranscript and late onStart does not repopulate it', async () => {
    const engine = new VoiceEngine();
    vi.spyOn(engine['ai'].constructor as any, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);
    vi.spyOn(engine['recognition'], 'start').mockImplementation(() => {});
    vi.spyOn(engine['recognition'], 'pause').mockImplementation(() => {});
    vi.spyOn(engine['recognition'], 'resume').mockImplementation(() => {});

    const onStarts: ((meta?: { durationMs?: number }) => void)[] = [];
    const resolvers: (() => void)[] = [];
    vi.spyOn(engine['synthesis'], 'enqueue').mockImplementation((text, _lang, opts) => {
      if (text.startsWith('Hi.')) return Promise.resolve();
      if (opts?.onStart) onStarts.push(opts.onStart);
      return new Promise<void>((resolve) => resolvers.push(resolve));
    });
    vi.spyOn(engine['synthesis'], 'cancel').mockImplementation(() => {
      resolvers.forEach((r) => r());
    });

    await engine.startSession('en');

    const asyncGen = (async function* () {
      yield 'Sentence one being spoken. ';
      yield 'Sentence two in queue.';
    })();
    vi.spyOn(engine['ai'], 'prompt').mockReturnValue(asyncGen as any);

    const turnPromise = engine['handleFinalTranscript']('interrupted prompt');
    await new Promise((r) => setTimeout(r, 0));

    expect(onStarts.length).toBe(2);

    onStarts[0]({ durationMs: 2000 });
    expect(engine.state.interimTranscript).toBe('Sentence');

    engine['handleBargeIn']();
    expect(engine.state.interimTranscript).toBe('');

    onStarts[1]({ durationMs: 2000 });
    expect(engine.state.interimTranscript).toBe('');

    await turnPromise;
    expect(engine.state.interimTranscript).toBe('');
    engine.destroy();
  });
});

describe('VoiceEngine with Image Context', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    document.body.innerHTML = `
      <main>
        <h1>Section 1</h1>
        <p>Text for section 1.</p>
        <img id="img1" src="/test1.jpg" alt="First photo" width="200" height="200" />
        <p>Between images.</p>
        <img id="img2" src="/test2.jpg" alt="Second photo" width="200" height="200" />
      </main>
    `;
  });

  afterEach(() => {
    setLogLevel(LogLevel.Disabled);
    vi.restoreAllMocks();
  });

  it('1. image probe available, two prepared images: ai.init gets both images and multimodal header without alt text', async () => {
    const engine = new VoiceEngine({ interactiveHighlights: true });
    vi.spyOn(AISessionService, 'checkAvailability').mockResolvedValue('available');
    const initSpy = vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);
    vi.spyOn(engine['synthesis'], 'enqueue').mockResolvedValue();

    const fakeImg1 = { id: 'img-1', source: {} as any, close: vi.fn() };
    const fakeImg2 = { id: 'img-2', source: {} as any, close: vi.fn() };
    vi.mocked(preparePageImages).mockResolvedValue({
      attached: [fakeImg1, fakeImg2],
      skipped: [],
    });

    await engine.startSession('en');
    await engine['aiReady'];

    expect(initSpy).toHaveBeenCalledWith(
      expect.stringContaining('Images on this page. Attached ones were shared with you as pictures right after this text.'),
      'en',
      undefined,
      expect.objectContaining({
        interactiveHighlights: true,
        images: [fakeImg1, fakeImg2],
      }),
    );

    const text = initSpy.mock.calls[0][0];
    expect(text).toContain('[img-1] attached');
    expect(text).toContain('[img-2] attached');
    expect(text).not.toContain('First photo');
    expect(text).not.toContain('Second photo');
    expect(fakeImg1.close).toHaveBeenCalled();
    expect(fakeImg2.close).toHaveBeenCalled();
    engine.destroy();
  });

  it('2. one prepared, one skipped tainted: text has attached and not attached with caption', async () => {
    const engine = new VoiceEngine({ interactiveHighlights: true });
    vi.spyOn(AISessionService, 'checkAvailability').mockResolvedValue('available');
    const initSpy = vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);
    vi.spyOn(engine['synthesis'], 'enqueue').mockResolvedValue();

    const fakeImg1 = { id: 'img-1', source: {} as any, close: vi.fn() };
    vi.mocked(preparePageImages).mockResolvedValue({
      attached: [fakeImg1],
      skipped: [{ id: 'img-2', reason: 'tainted' }],
    });

    await engine.startSession('en');

    const text = initSpy.mock.calls[0][0];
    expect(text).toContain('[img-1] attached');
    expect(text).toContain('[img-2] not attached, caption: "Second photo"');
    engine.destroy();
  });

  it('3. probe downloadable: ai.init gets no images, text-only header, alt text lines present', async () => {
    const engine = new VoiceEngine({ interactiveHighlights: true });
    vi.spyOn(AISessionService, 'checkAvailability').mockImplementation(async (_lang, opts) => {
      if (opts?.image) return 'downloadable';
      return 'available';
    });
    const initSpy = vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);
    vi.spyOn(engine['synthesis'], 'enqueue').mockResolvedValue();

    await engine.startSession('en');

    expect(initSpy).toHaveBeenCalledWith(
      expect.stringContaining('Images on this page, described by their alt text. Image data is not available.'),
      'en',
      undefined,
      expect.objectContaining({
        interactiveHighlights: true,
        images: [],
      }),
    );
    const text = initSpy.mock.calls[0][0];
    expect(text).toContain('[img-1] alt text: "First photo"');
    expect(text).toContain('[img-2] alt text: "Second photo"');
    engine.destroy();
  });

  it('4. imageContext: false: probe never called with image, text-only index', async () => {
    const engine = new VoiceEngine({ interactiveHighlights: true, imageContext: false });
    const checkSpy = vi.spyOn(AISessionService, 'checkAvailability').mockResolvedValue('available');
    const initSpy = vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);
    vi.spyOn(engine['synthesis'], 'enqueue').mockResolvedValue();

    await engine.startSession('en');

    const imageCalls = checkSpy.mock.calls.filter((call) => call[1]?.image);
    expect(imageCalls).toHaveLength(0);
    expect(initSpy).toHaveBeenCalledWith(
      expect.stringContaining('Images on this page, described by their alt text. Image data is not available.'),
      'en',
      undefined,
      expect.objectContaining({ images: [] }),
    );
    engine.destroy();
  });

  it('5. highlights off: pageIndexer is null, ai.init gets no images', async () => {
    const engine = new VoiceEngine({ interactiveHighlights: false });
    const checkSpy = vi.spyOn(AISessionService, 'checkAvailability').mockResolvedValue('available');
    const initSpy = vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);
    vi.spyOn(engine['synthesis'], 'enqueue').mockResolvedValue();

    await engine.startSession('en');

    expect(engine['pageIndexer']).toBeNull();
    const imageCalls = checkSpy.mock.calls.filter((call) => call[1]?.image);
    expect(imageCalls).toHaveLength(0);
    expect(initSpy).toHaveBeenCalledWith(
      expect.any(String),
      'en',
      undefined,
      expect.objectContaining({ interactiveHighlights: false }),
    );
    engine.destroy();
  });

  it('6. no images on page: probe never called with image', async () => {
    document.body.innerHTML = '<main><h1>Only Text</h1><p>No pictures here.</p></main>';
    const engine = new VoiceEngine({ interactiveHighlights: true });
    const checkSpy = vi.spyOn(AISessionService, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);
    vi.spyOn(engine['synthesis'], 'enqueue').mockResolvedValue();

    await engine.startSession('en');

    const imageCalls = checkSpy.mock.calls.filter((call) => call[1]?.image);
    expect(imageCalls).toHaveLength(0);
    engine.destroy();
  });

  it('7. ladder: rejects on first two calls, resolves on third with 2, 1, 0 images', async () => {
    const engine = new VoiceEngine({ interactiveHighlights: true });
    vi.spyOn(AISessionService, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);
    vi.spyOn(engine['synthesis'], 'enqueue').mockResolvedValue();

    const fakeImg1 = { id: 'img-1', source: {} as any, close: vi.fn() };
    const fakeImg2 = { id: 'img-2', source: {} as any, close: vi.fn() };
    vi.mocked(preparePageImages).mockResolvedValue({
      attached: [fakeImg1, fakeImg2],
      skipped: [],
    });

    let callCount = 0;
    const initCalls: any[] = [];
    vi.spyOn(engine['ai'], 'init').mockImplementation(async (text, lang, onProg, opts) => {
      callCount++;
      initCalls.push({ text, opts });
      if (callCount < 3) {
        throw new Error('QuotaExceededError');
      }
    });

    await engine.startSession('en');
    await engine['aiReady'];

    expect(callCount).toBe(3);
    expect(initCalls[0].opts.images).toHaveLength(2);
    expect(initCalls[1].opts.images).toHaveLength(1);
    expect(initCalls[2].opts.images).toHaveLength(0);
    expect(initCalls[2].text).toContain('Images on this page, described by their alt text. Image data is not available.');
    expect(initCalls[2].text).toContain('[img-1] alt text: "First photo"');
    expect(initCalls[2].text).not.toContain('not attached');
    expect(fakeImg1.close).toHaveBeenCalledTimes(1);
    expect(fakeImg2.close).toHaveBeenCalledTimes(1);
    engine.destroy();
  });

  it('8. ladder with one image: two attempts (1, 0)', async () => {
    const engine = new VoiceEngine({ interactiveHighlights: true });
    vi.spyOn(AISessionService, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);
    vi.spyOn(engine['synthesis'], 'enqueue').mockResolvedValue();

    const fakeImg1 = { id: 'img-1', source: {} as any, close: vi.fn() };
    vi.mocked(preparePageImages).mockResolvedValue({
      attached: [fakeImg1],
      skipped: [],
    });

    let callCount = 0;
    const initCalls: any[] = [];
    vi.spyOn(engine['ai'], 'init').mockImplementation(async (text, lang, onProg, opts) => {
      callCount++;
      initCalls.push({ text, opts });
      if (callCount === 1) throw new Error('QuotaExceededError');
    });

    await engine.startSession('en');
    await engine['aiReady'];

    expect(callCount).toBe(2);
    expect(initCalls[0].opts.images).toHaveLength(1);
    expect(initCalls[1].opts.images).toHaveLength(0);
    engine.destroy();
  });

  it('9. ai.init rejects on last attempt: logged as AI unavailable and session continues without AI', async () => {
    const engine = new VoiceEngine({ interactiveHighlights: true });
    vi.spyOn(AISessionService, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['synthesis'], 'enqueue').mockResolvedValue();

    vi.mocked(preparePageImages).mockResolvedValue({
      attached: [],
      skipped: [],
    });

    vi.spyOn(engine['ai'], 'init').mockRejectedValue(new Error('Fatal session error'));

    await expect(engine.startSession('en')).resolves.not.toThrow();
    expect(engine['ai'].isReady).toBe(false);
    engine.destroy();
  });

  it('10. switchLanguage runs pipeline again with new language in image probe', async () => {
    const engine = new VoiceEngine({ interactiveHighlights: true });
    const checkSpy = vi.spyOn(AISessionService, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);
    vi.spyOn(engine['synthesis'], 'enqueue').mockResolvedValue();

    vi.mocked(preparePageImages).mockResolvedValue({
      attached: [{ id: 'img-1', source: {} as any, close: vi.fn() }],
      skipped: [],
    });

    await engine.startSession('en');

    checkSpy.mockClear();
    engine.switchLanguage('es');
    await new Promise((r) => setTimeout(r, 10));

    const esImageCalls = checkSpy.mock.calls.filter((call) => call[0] === 'es' && call[1]?.image);
    expect(esImageCalls).toHaveLength(1);
    engine.destroy();
  });

  it('11. sessionActive false after probe: ai.init is never called', async () => {
    const engine = new VoiceEngine({ interactiveHighlights: true });
    vi.spyOn(AISessionService, 'checkAvailability').mockImplementation(async () => {
      engine.endSession();
      return 'available';
    });
    const initSpy = vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);
    vi.spyOn(engine['synthesis'], 'enqueue').mockResolvedValue();

    await engine.startSession('en');

    expect(initSpy).not.toHaveBeenCalled();
    engine.destroy();
  });

  it('12. switchLanguage after multimodal session where second probe returns downloadable produces text-only index with alt text', async () => {
    const engine = new VoiceEngine({ interactiveHighlights: true });
    vi.spyOn(AISessionService, 'checkAvailability').mockImplementation(async (lang, opts) => {
      if (lang === 'es' && opts?.image) return 'downloadable';
      return 'available';
    });
    const initSpy = vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);
    vi.spyOn(engine['synthesis'], 'enqueue').mockResolvedValue();

    vi.mocked(preparePageImages).mockResolvedValue({
      attached: [{ id: 'img-1', source: {} as any, close: vi.fn() }],
      skipped: [],
    });

    await engine.startSession('en');
    initSpy.mockClear();

    engine.switchLanguage('es');
    await new Promise((r) => setTimeout(r, 10));

    expect(initSpy).toHaveBeenCalledWith(
      expect.stringContaining('Images on this page, described by their alt text. Image data is not available.'),
      'es',
      undefined,
      expect.objectContaining({ images: [] }),
    );
    const text = initSpy.mock.calls[0][0];
    expect(text).toContain('[img-1] alt text: "First photo"');
    expect(text).not.toContain('not attached');
    engine.destroy();
  });

  it('13. all images skipped tainted logs all images skipped with reasons', async () => {
    setLogLevel(LogLevel.Info);
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const engine = new VoiceEngine({ interactiveHighlights: true });
    vi.spyOn(AISessionService, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);
    vi.spyOn(engine['synthesis'], 'enqueue').mockResolvedValue();

    vi.mocked(preparePageImages).mockResolvedValue({
      attached: [],
      skipped: [
        { id: 'img-1', reason: 'tainted' },
        { id: 'img-2', reason: 'tainted' },
      ],
    });

    await engine.startSession('en');
    await engine['aiReady'];

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ariontalk:voice-engine]'),
      'image context off: all images skipped [img-1 tainted, img-2 tainted]',
    );
    engine.destroy();
  });

  it('14. ladder ending on empty attempt logs session create failed with images', async () => {
    setLogLevel(LogLevel.Info);
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const engine = new VoiceEngine({ interactiveHighlights: true });
    vi.spyOn(AISessionService, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);
    vi.spyOn(engine['synthesis'], 'enqueue').mockResolvedValue();

    vi.mocked(preparePageImages).mockResolvedValue({
      attached: [{ id: 'img-1', source: {} as any, close: vi.fn() }],
      skipped: [],
    });

    vi.spyOn(engine['ai'], 'init').mockImplementation(async (_text, _lang, _prog, opts) => {
      if (opts?.images && opts.images.length > 0) {
        throw new Error('ImageQuotaExceeded');
      }
    });

    await engine.startSession('en');
    await engine['aiReady'];

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ariontalk:voice-engine]'),
      'image context off: session create failed with images, running text only',
    );
    engine.destroy();
  });

  it('15. switchLanguage where ai.init rejects on every ladder attempt sets error state', async () => {
    const engine = new VoiceEngine({ interactiveHighlights: true });
    vi.spyOn(AISessionService, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);
    vi.spyOn(engine['synthesis'], 'enqueue').mockResolvedValue();

    vi.mocked(preparePageImages).mockResolvedValue({
      attached: [{ id: 'img-1', source: {} as any, close: vi.fn() }],
      skipped: [],
    });

    await engine.startSession('en');

    vi.spyOn(engine['ai'], 'init').mockRejectedValue(new Error('Persistent language switch failure'));

    engine.switchLanguage('es');
    await new Promise((r) => setTimeout(r, 10));

    expect(engine.state.status).toBe('error');
    expect(engine.state.error).toBe('Persistent language switch failure');
    engine.destroy();
  });
});

describe('VoiceEngine refresh features (userSpeaking, errorCode, onDevice, meter, getAudioLevels)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;
    delete (globalThis as any).AudioContext;
    delete (window as any).AudioContext;
    Reflect.deleteProperty(globalThis.navigator, 'mediaDevices');
  });

  function stubEngineBasics(engine: VoiceEngine) {
    vi.spyOn(AISessionService, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);
    vi.spyOn(engine['synthesis'], 'enqueue').mockResolvedValue(undefined);
    vi.spyOn(engine['recognition'], 'start').mockImplementation(() => {});
    vi.spyOn(engine['recognition'], 'pause').mockImplementation(() => {});
    vi.spyOn(engine['recognition'], 'resume').mockImplementation(() => {});
    vi.spyOn(engine['recognition'], 'stop').mockImplementation(() => {});
  }

  it('userSpeaking goes true on first interim result in listening and false on final result, thinking, mute, resume and end', async () => {
    const engine = new VoiceEngine();
    stubEngineBasics(engine);

    let resolvePrompt: () => void = () => {};
    vi.spyOn(engine['ai'], 'prompt').mockImplementation(() => {
      return (async function* () {
        await new Promise<void>((r) => { resolvePrompt = r; });
        yield 'Answer text.';
      })() as any;
    });

    await engine.startSession('en');
    expect(engine.state.status).toBe('listening');
    expect(engine.state.userSpeaking).toBe(false);

    // True on first interim result in listening
    engine['recognition'].onInterimResult?.('hello');
    expect(engine.state.userSpeaking).toBe(true);
    expect(engine.state.interimTranscript).toBe('hello');

    // False on mute
    engine.setMuted(true);
    expect(engine.state.userSpeaking).toBe(false);
    engine.setMuted(false);

    // True again on interim result, then false on resumeListening()
    engine['recognition'].onInterimResult?.('test');
    expect(engine.state.userSpeaking).toBe(true);
    engine['resumeListening']();
    expect(engine.state.userSpeaking).toBe(false);

    // True again on interim result, then false on final result / thinking
    engine['recognition'].onInterimResult?.('what is this');
    expect(engine.state.userSpeaking).toBe(true);
    engine['recognition'].onFinalResult?.('what is this');
    expect(engine.state.userSpeaking).toBe(false);
    expect(engine.state.status).toBe('thinking');

    resolvePrompt();
    await vi.waitFor(() => expect(engine.state.status).toBe('listening'));
    expect(engine.state.userSpeaking).toBe(false);

    // True on interim, then false on endSession()
    engine['recognition'].onInterimResult?.('bye');
    expect(engine.state.userSpeaking).toBe(true);
    engine.endSession();
    expect(engine.state.userSpeaking).toBe(false);

    engine.destroy();
  });

  it('error code row 1: recognition not-allowed and service-not-allowed map to mic-blocked (terminal)', async () => {
    vi.useFakeTimers();
    const engine = new VoiceEngine();
    engine['sessionActive'] = true;

    for (const raw of ['not-allowed', 'service-not-allowed']) {
      engine['recognition'].onError?.(raw);
      expect(engine.state.status).toBe('error');
      expect(engine.state.errorCode).toBe('mic-blocked');
      expect(engine.state.error).not.toBe(raw);

      await vi.advanceTimersByTimeAsync(4000);
      expect(engine.state.status).toBe('error');
      expect(engine.state.errorCode).toBe('mic-blocked');
    }

    engine.destroy();
  });

  it('error code row 2: recognition audio-capture maps to mic-not-found (terminal)', async () => {
    vi.useFakeTimers();
    const engine = new VoiceEngine();
    engine['sessionActive'] = true;

    engine['recognition'].onError?.('audio-capture');
    expect(engine.state.status).toBe('error');
    expect(engine.state.errorCode).toBe('mic-not-found');
    expect(engine.state.error).not.toBe('audio-capture');

    await vi.advanceTimersByTimeAsync(4000);
    expect(engine.state.status).toBe('error');
    expect(engine.state.errorCode).toBe('mic-not-found');

    engine.destroy();
  });

  it('error code row 3: speech-local-unavailable maps to speech-unavailable (terminal)', async () => {
    vi.useFakeTimers();
    const engine = new VoiceEngine();
    engine['sessionActive'] = true;

    engine['recognition'].onError?.('speech-local-unavailable');
    expect(engine.state.status).toBe('error');
    expect(engine.state.errorCode).toBe('speech-unavailable');

    await vi.advanceTimersByTimeAsync(4000);
    expect(engine.state.status).toBe('error');
    expect(engine.state.errorCode).toBe('speech-unavailable');

    engine.destroy();
  });

  it('error code row 4: speech-recognition-unavailable and network map to speech-stopped (non-terminal) and clear after auto-recovery', async () => {
    vi.useFakeTimers();
    const engine = new VoiceEngine();
    stubEngineBasics(engine);
    engine['sessionActive'] = true;

    for (const raw of ['speech-recognition-unavailable', 'network']) {
      engine['recognition'].onError?.(raw);
      expect(engine.state.status).toBe('error');
      expect(engine.state.errorCode).toBe('speech-stopped');

      await vi.advanceTimersByTimeAsync(3100);
      expect(engine.state.status).toBe('listening');
      expect(engine.state.error).toBeNull();
      expect(engine.state.errorCode).toBeUndefined();
    }

    engine.destroy();
  });

  it('error code row 5: handleFinalTranscript when model is not ready maps to model-unavailable (non-terminal) and clears after auto-recovery', async () => {
    vi.useFakeTimers();
    const engine = new VoiceEngine();
    stubEngineBasics(engine);
    vi.spyOn(engine['ai'], 'init').mockRejectedValue(new Error('Model load failed'));
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(false);

    await engine.startSession('en');
    await engine['handleFinalTranscript']('hello');

    expect(engine.state.status).toBe('error');
    expect(engine.state.errorCode).toBe('model-unavailable');

    await vi.advanceTimersByTimeAsync(3100);
    expect(engine.state.status).toBe('listening');
    expect(engine.state.error).toBeNull();
    expect(engine.state.errorCode).toBeUndefined();

    engine.destroy();
  });

  it('error code row 6: LanguageModel.create out-of-memory rejection maps to model-memory (terminal)', async () => {
    vi.useFakeTimers();
    const engine = new VoiceEngine();
    stubEngineBasics(engine);
    vi.spyOn(engine['ai'], 'init').mockRejectedValue(new DOMException('Out of memory', 'UnknownError'));
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(false);

    await engine.startSession('en');
    await engine['aiReady'];

    expect(engine.state.status).toBe('error');
    expect(engine.state.errorCode).toBe('model-memory');

    await vi.advanceTimersByTimeAsync(4000);
    expect(engine.state.status).toBe('error');
    expect(engine.state.errorCode).toBe('model-memory');

    engine.destroy();
  });

  it('terminal errors stop recognition, release meter, stop barge-in, and ignore subsequent final transcripts', async () => {
    const stopMonitoring = vi.fn();
    const mockBargeIn = {
      init: vi.fn().mockResolvedValue(undefined),
      startMonitoring: vi.fn(),
      stopMonitoring,
      destroy: vi.fn(),
    };
    const engine = new VoiceEngine({ bargeInDetector: mockBargeIn });
    stubEngineBasics(engine);
    const releaseSpy = vi.spyOn(engine['meter'], 'release');
    const stopRecSpy = vi.spyOn(engine['recognition'], 'stop');

    vi.spyOn(engine['ai'], 'init').mockRejectedValue(new DOMException('Out of memory', 'UnknownError'));
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(false);

    await engine.startSession('en');
    await engine['aiReady'];

    expect(engine.state.status).toBe('error');
    expect(engine.state.errorCode).toBe('model-memory');
    expect(stopRecSpy).toHaveBeenCalled();
    expect(releaseSpy).toHaveBeenCalled();
    expect(stopMonitoring).toHaveBeenCalled();

    // A final transcript from the recognition stub does not change the status from 'error'
    engine['recognition'].onFinalResult?.('hello there');
    expect(engine.state.status).toBe('error');
    expect(engine.state.errorCode).toBe('model-memory');

    engine.destroy();
  });

  it('terminal model-memory followed by answer-failed stays error with model-memory, fires no timer, and does not call getUserMedia again', async () => {
    vi.useFakeTimers();
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    });
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
      writable: true,
    });

    const engine = new VoiceEngine();
    stubEngineBasics(engine);

    await engine.startSession('en');
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));

    let rejectPrompt: (err: Error) => void = () => {};
    vi.spyOn(engine['ai'], 'prompt').mockImplementation(() => {
      return (async function* () {
        yield 'Thinking... ';
        await new Promise<void>((_resolve, reject) => {
          rejectPrompt = reject;
        });
      })() as any;
    });

    const turnPromise = engine['handleFinalTranscript']('hello');
    await vi.advanceTimersByTimeAsync(0);

    // Language switch hits OOM (terminal model-memory) while the answer stream is in flight
    vi.spyOn(engine['ai'], 'init').mockRejectedValueOnce(new DOMException('Out of memory', 'UnknownError'));
    engine.switchLanguage('es');
    await engine['aiReady'];

    expect(engine.state.status).toBe('error');
    expect(engine.state.errorCode).toBe('model-memory');

    // In-flight answer stream now throws -> raises non-terminal answer-failed
    rejectPrompt(new Error('Session destroyed'));
    await turnPromise;

    expect(engine.state.status).toBe('error');
    expect(engine.state.errorCode).toBe('model-memory');
    expect(engine.state.error).toBe('Your browser does not have enough memory for the AI model.');

    // Unmuting while terminalError is true does not resume meter or recognition
    const resumeRecSpy = vi.spyOn(engine['recognition'], 'resume');
    engine.setMuted(true);
    engine.setMuted(false);
    expect(resumeRecSpy).not.toHaveBeenCalled();

    // Advance 5 seconds: no auto-recovery timer fires and getUserMedia is not called again
    await vi.advanceTimersByTimeAsync(5000);
    expect(engine.state.status).toBe('error');
    expect(engine.state.errorCode).toBe('model-memory');
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    engine.destroy();
  });

  it('terminal mic-blocked during speaking keeps status error with mic-blocked after speech queue resolves, and new startSession clears the flag', async () => {
    const engine = new VoiceEngine();
    stubEngineBasics(engine);
    const resumeRecSpy = vi.spyOn(engine['recognition'], 'resume');

    let resolveSpeech: () => void = () => {};
    vi.spyOn(engine['synthesis'], 'enqueue').mockImplementation((text) => {
      if (text.startsWith('Hi')) return Promise.resolve();
      return new Promise<void>((resolve) => {
        resolveSpeech = resolve;
      });
    });
    vi.spyOn(engine['ai'], 'prompt').mockImplementation(() => {
      return (async function* () {
        yield 'Here is the answer.';
      })() as any;
    });

    await engine.startSession('en');

    const turnPromise = engine['handleFinalTranscript']('question');
    await new Promise((r) => setTimeout(r, 0));
    expect(engine.state.status).toBe('speaking');

    // Meter reports NotAllowedError (terminal mic-blocked) while speaking
    engine['meter'].onError?.('NotAllowedError');
    expect(engine.state.status).toBe('error');
    expect(engine.state.errorCode).toBe('mic-blocked');

    // Speech queue drains -> handleFinalTranscript finishes, but status stays error with mic-blocked
    resolveSpeech();
    await turnPromise;
    expect(engine.state.status).toBe('error');
    expect(engine.state.errorCode).toBe('mic-blocked');
    expect(resumeRecSpy).not.toHaveBeenCalled();

    // Starting a new session clears terminalError and reaches listening
    await engine.startSession('en');
    expect(engine['terminalError']).toBe(false);
    expect(engine.state.status).toBe('listening');
    expect(engine.state.error).toBeNull();
    expect(engine.state.errorCode).toBeUndefined();

    engine.destroy();
  });

  it('terminal mic-blocked raised while thinking (before first sentence) aborts the turn and keeps status error', async () => {
    const engine = new VoiceEngine();
    stubEngineBasics(engine);

    await engine.startSession('en');

    const enqueueSpy = vi.spyOn(engine['synthesis'], 'enqueue');
    const cancelSpy = vi.spyOn(engine['synthesis'], 'cancel');

    let releaseStream: () => void = () => {};
    vi.spyOn(engine['ai'], 'prompt').mockImplementation(() => {
      return (async function* () {
        await new Promise<void>((r) => {
          releaseStream = r;
        });
        yield 'First sentence here. ';
        yield 'Second sentence here. ';
        yield 'Third sentence here.';
      })() as any;
    });

    const turnPromise = engine['handleFinalTranscript']('question');
    await new Promise((r) => setTimeout(r, 0));
    expect(engine.state.status).toBe('thinking');

    enqueueSpy.mockClear();
    cancelSpy.mockClear();

    // Raise terminal mic-blocked while status is thinking, before the first sentence
    engine['meter'].onError?.('NotAllowedError');
    expect(engine.state.status).toBe('error');
    expect(engine.state.errorCode).toBe('mic-blocked');
    expect(cancelSpy).toHaveBeenCalled();

    // Stubbed stream now yields three sentences
    releaseStream();
    await turnPromise;

    expect(engine.state.status).toBe('error');
    expect(engine.state.errorCode).toBe('mic-blocked');
    expect(enqueueSpy).not.toHaveBeenCalled();
    expect(engine.state.interimTranscript).toBe('');

    engine.destroy();
  });

  it('terminal mic-blocked raised during await aiReady aborts the turn and keeps status error', async () => {
    const engine = new VoiceEngine();
    stubEngineBasics(engine);

    let resolveAiInit: () => void = () => {};
    let aiReadyFlag = false;
    vi.spyOn(engine['ai'], 'init').mockImplementation(
      () =>
        new Promise<void>((r) => {
          resolveAiInit = () => {
            aiReadyFlag = true;
            r();
          };
        }),
    );
    vi.spyOn(engine['ai'], 'isReady', 'get').mockImplementation(() => aiReadyFlag);

    await engine.startSession('en');

    const enqueueSpy = vi.spyOn(engine['synthesis'], 'enqueue');
    const cancelSpy = vi.spyOn(engine['synthesis'], 'cancel');

    vi.spyOn(engine['ai'], 'prompt').mockImplementation(() => {
      return (async function* () {
        yield 'First sentence here. ';
        yield 'Second sentence here. ';
        yield 'Third sentence here.';
      })() as any;
    });

    // Begin turn while ai.isReady is false -> pauses on await this.aiReady
    const turnPromise = engine['handleFinalTranscript']('early question');
    await new Promise((r) => setTimeout(r, 0));

    enqueueSpy.mockClear();
    cancelSpy.mockClear();

    // Raise terminal mic-blocked during await this.aiReady
    engine['meter'].onError?.('NotAllowedError');
    expect(engine.state.status).toBe('error');
    expect(engine.state.errorCode).toBe('mic-blocked');
    expect(cancelSpy).toHaveBeenCalled();

    // Resolve aiReady -> stream yields three sentences
    resolveAiInit();
    await turnPromise;

    expect(engine.state.status).toBe('error');
    expect(engine.state.errorCode).toBe('mic-blocked');
    expect(enqueueSpy).not.toHaveBeenCalled();
    expect(engine.state.interimTranscript).toBe('');

    // updateState({ status: 'listening' }) while terminalError is true leaves status at error (other fields apply)
    engine['updateState']({ status: 'listening', elapsedSeconds: 42 });
    expect(engine.state.status).toBe('error');
    expect(engine.state.errorCode).toBe('mic-blocked');
    expect(engine.state.elapsedSeconds).toBe(42);

    // endSession() still moves it to idle
    engine.endSession();
    expect(engine.state.status).toBe('idle');
    expect(engine.state.error).toBeNull();
    expect(engine.state.errorCode).toBeUndefined();

    engine.destroy();
  });

  it('retires a turn parked at await aiReady when the session restarts or a terminal error occurs before aiReady resolves', async () => {
    const engine = new VoiceEngine();
    stubEngineBasics(engine);

    let resolveAiInit1: () => void = () => {};
    let aiReadyFlag = false;
    vi.spyOn(engine['ai'], 'init').mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          resolveAiInit1 = () => {
            aiReadyFlag = true;
            r();
          };
        }),
    );
    vi.spyOn(engine['ai'], 'isReady', 'get').mockImplementation(() => aiReadyFlag);

    await engine.startSession('en');

    const promptSpy = vi.spyOn(engine['ai'], 'prompt').mockImplementation(() => {
      return (async function* () {
        yield 'Stale answer.';
      })() as any;
    });
    const enqueueSpy = vi.spyOn(engine['synthesis'], 'enqueue');

    // 1. Turn parked at await this.aiReady -> endSession() -> startSession() -> old aiReady resolves
    const parkedTurn1 = engine['handleFinalTranscript']('old session question');
    await new Promise((r) => setTimeout(r, 0));

    engine.endSession();
    vi.spyOn(engine['ai'], 'init').mockResolvedValueOnce(undefined);
    await engine.startSession('en');
    enqueueSpy.mockClear();

    resolveAiInit1();
    await parkedTurn1;

    expect(promptSpy).not.toHaveBeenCalled();
    expect(enqueueSpy).not.toHaveBeenCalled();
    expect(engine.state.status).toBe('listening');

    // 2. Turn parked at await this.aiReady -> terminal mic-blocked -> aiReady resolves: ai.prompt is not called
    engine.endSession();
    aiReadyFlag = false;
    let resolveAiInit2: () => void = () => {};
    vi.spyOn(engine['ai'], 'init').mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          resolveAiInit2 = () => {
            aiReadyFlag = true;
            r();
          };
        }),
    );
    await engine.startSession('en');

    const parkedTurn2 = engine['handleFinalTranscript']('question before mic-blocked');
    await new Promise((r) => setTimeout(r, 0));

    engine['meter'].onError?.('NotAllowedError');
    expect(engine.state.status).toBe('error');
    expect(engine.state.errorCode).toBe('mic-blocked');

    resolveAiInit2();
    await parkedTurn2;

    expect(promptSpy).not.toHaveBeenCalled();

    engine.destroy();
  });

  it('retired turn queue draining does not stop bargeIn or clear selfSpeaking while turn 2 is speaking', async () => {
    const mockBargeIn = {
      init: vi.fn().mockResolvedValue(undefined),
      startMonitoring: vi.fn(),
      stopMonitoring: vi.fn(),
      destroy: vi.fn(),
    };
    const engine = new VoiceEngine({ bargeInDetector: mockBargeIn });
    stubEngineBasics(engine);

    let resolveTurn1Queue: () => void = () => {};
    let resolveTurn2Queue: () => void = () => {};
    vi.spyOn(engine['synthesis'], 'enqueue').mockImplementation((text, _lang, opts) => {
      if (text.startsWith('Hi.')) return Promise.resolve();
      if (text.startsWith('Turn one')) {
        return new Promise<void>((r) => {
          resolveTurn1Queue = r;
        });
      }
      opts?.onStart?.();
      return new Promise<void>((r) => {
        resolveTurn2Queue = r;
      });
    });

    await engine.startSession('en');

    let finishTurn1Stream: () => void = () => {};
    let finishTurn2Stream: () => void = () => {};
    vi.spyOn(engine['ai'], 'prompt').mockImplementation((promptText: string) => {
      if (promptText === 'first part') {
        return (async function* () {
          yield 'Turn one sentence. ';
          await new Promise<void>((r) => {
            finishTurn1Stream = r;
          });
        })() as any;
      }
      return (async function* () {
        yield 'Turn two sentence. ';
        await new Promise<void>((r) => {
          finishTurn2Stream = r;
        });
      })() as any;
    });

    // Turn 1 starts streaming and enqueues a sentence
    const turn1 = engine['handleFinalTranscript']('first part');
    await new Promise((r) => setTimeout(r, 0));

    // A second final transcript starts turn 2, retiring turn 1, enqueuing speech and arming barge-in
    mockBargeIn.stopMonitoring.mockClear();
    const turn2 = engine['handleFinalTranscript']('second part');
    await new Promise((r) => setTimeout(r, 0));

    expect(engine['selfSpeaking']).toBe(true);
    expect(mockBargeIn.startMonitoring).toHaveBeenCalledTimes(1);

    // Turn 1's stream finishes and its queue resolves while turn 2 is still speaking
    finishTurn1Stream();
    resolveTurn1Queue();
    await turn1;

    expect(mockBargeIn.stopMonitoring).not.toHaveBeenCalled();
    expect(engine['selfSpeaking']).toBe(true);

    // Finish turn 2 cleanly
    finishTurn2Stream();
    resolveTurn2Queue();
    await turn2;
    expect(engine['selfSpeaking']).toBe(false);
    expect(mockBargeIn.stopMonitoring).toHaveBeenCalledTimes(1);

    engine.destroy();
  });

  it('retired turn stream rejecting after endSession and startSession does not cancel the new session greeting', async () => {
    const engine = new VoiceEngine();
    stubEngineBasics(engine);

    let rejectStream: (err: Error) => void = () => {};
    vi.spyOn(engine['ai'], 'prompt').mockImplementation(() => {
      return (async function* () {
        yield 'Streaming answer. ';
        await new Promise<void>((_r, reject) => {
          rejectStream = reject;
        });
      })() as any;
    });

    await engine.startSession('en');

    const turn1 = engine['handleFinalTranscript']('hello');
    await new Promise((r) => setTimeout(r, 0));

    // End the session and immediately start a new session (greeting enqueued)
    engine.endSession();
    let resolveGreeting: () => void = () => {};
    vi.spyOn(engine['synthesis'], 'enqueue').mockImplementationOnce(() => {
      return new Promise<void>((r) => {
        resolveGreeting = r;
      });
    });
    const cancelSpy = vi.spyOn(engine['synthesis'], 'cancel');

    const startPromise = engine.startSession('en');
    await new Promise((r) => setTimeout(r, 0));
    cancelSpy.mockClear();

    // Old turn's stream rejects after the new session has started
    rejectStream(new Error('Session destroyed'));
    await turn1;

    expect(cancelSpy).not.toHaveBeenCalled();

    resolveGreeting();
    await startPromise;
    engine.destroy();
  });

  it('error code row 7: answer stream throwing maps to answer-failed (non-terminal) and clears after auto-recovery', async () => {
    vi.useFakeTimers();
    const engine = new VoiceEngine();
    stubEngineBasics(engine);
    vi.spyOn(engine['ai'], 'prompt').mockImplementation(() => {
      return (async function* () {
        yield 'Partial. ';
        throw new Error('Stream interrupted');
      })() as any;
    });

    await engine.startSession('en');
    await engine['handleFinalTranscript']('question');

    expect(engine.state.status).toBe('error');
    expect(engine.state.errorCode).toBe('answer-failed');
    expect(engine.state.error).toBe('Stream interrupted');

    await vi.advanceTimersByTimeAsync(3100);
    expect(engine.state.status).toBe('listening');
    expect(engine.state.error).toBeNull();
    expect(engine.state.errorCode).toBeUndefined();

    engine.destroy();
  });

  it('error code row 8: reinitAI throwing maps to language-switch-failed (non-terminal) and clears after auto-recovery', async () => {
    vi.useFakeTimers();
    const engine = new VoiceEngine();
    stubEngineBasics(engine);

    await engine.startSession('en');

    vi.spyOn(engine['ai'], 'init').mockRejectedValue(new Error('Switch failed'));
    engine.switchLanguage('es');
    await engine['aiReady'];

    expect(engine.state.status).toBe('error');
    expect(engine.state.errorCode).toBe('language-switch-failed');

    await vi.advanceTimersByTimeAsync(3100);
    expect(engine.state.status).toBe('listening');
    expect(engine.state.error).toBeNull();
    expect(engine.state.errorCode).toBeUndefined();

    engine.destroy();
  });

  it('clears error and errorCode when moving to a non-error status before the 3s timer fires', async () => {
    vi.useFakeTimers();
    const engine = new VoiceEngine();
    stubEngineBasics(engine);

    let resolvePrompt: () => void = () => {};
    vi.spyOn(engine['ai'], 'prompt').mockImplementation(() => {
      return (async function* () {
        await new Promise<void>((r) => { resolvePrompt = r; });
        yield 'Answer.';
      })() as any;
    });

    await engine.startSession('en');

    // Trigger a non-terminal error
    vi.spyOn(engine['ai'], 'init').mockRejectedValueOnce(new Error('Switch failed'));
    engine.switchLanguage('es');
    await engine['aiReady'];
    expect(engine.state.status).toBe('error');
    expect(engine.state.errorCode).toBe('language-switch-failed');

    // Final transcript arrives within 3 seconds -> moves to thinking and clears error & errorCode
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);
    const turn = engine['handleFinalTranscript']('hello');
    expect(engine.state.status).toBe('thinking');
    expect(engine.state.error).toBeNull();
    expect(engine.state.errorCode).toBeUndefined();

    // Advance past the 3s timer -> errorCode remains undefined
    await vi.advanceTimersByTimeAsync(3100);
    expect(engine.state.status).toBe('thinking');
    expect(engine.state.errorCode).toBeUndefined();

    resolvePrompt();
    await turn;
    engine.destroy();
  });

  it('onDevice is undefined before probe, true for on-device recognition + local voice, false for cloud recognition or network voice, and recomputed on language switch', async () => {
    const engine = new VoiceEngine();
    vi.spyOn(AISessionService, 'checkAvailability').mockResolvedValue('available');
    vi.spyOn(engine['ai'], 'init').mockResolvedValue(undefined);
    vi.spyOn(engine['ai'], 'isReady', 'get').mockReturnValue(true);
    vi.spyOn(engine['synthesis'], 'enqueue').mockResolvedValue(undefined);

    let voices = [
      { id: 'en-local', name: 'Local EN', lang: 'en-US', local: true },
      { id: 'en-net', name: 'Network EN', lang: 'en-US', local: false },
      { id: 'es-net', name: 'Network ES', lang: 'es-ES', local: false },
    ];
    vi.spyOn(engine['synthesis'], 'getVoices').mockImplementation(() => voices);

    let resolveProbe: (val: string) => void = () => {};
    let probeStatuses: Record<string, string | Promise<string>> = {
      'en-US': new Promise<string>((r) => { resolveProbe = r; }),
      'es-ES': 'available',
    };
    const Ctor: any = vi.fn(function (this: any) {
      this.start = vi.fn();
      this.stop = vi.fn();
      this.abort = vi.fn();
    });
    Ctor.available = vi.fn().mockImplementation(({ langs }: { langs: string[] }) => {
      const res = probeStatuses[langs[0]] ?? 'available';
      return res instanceof Promise ? res : Promise.resolve(res);
    });
    (window as any).SpeechRecognition = Ctor;

    await engine.startSession('en');
    // Undefined before the recognition probe resolves
    expect(engine.state.onDevice).toBeUndefined();

    // Probe resolves to 'available' -> on-device recognition + local EN voice => true
    resolveProbe('available');
    await vi.waitFor(() => expect(engine.state.onDevice).toBe(true));

    // Selecting a network voice flips onDevice to false
    engine.applyVoiceSettings({ voiceId: 'en-net', rate: 1, pitch: 1, volume: 1 });
    expect(engine.state.onDevice).toBe(false);

    // Selecting the local voice again flips onDevice back to true
    engine.applyVoiceSettings({ voiceId: 'en-local', rate: 1, pitch: 1, volume: 1 });
    expect(engine.state.onDevice).toBe(true);

    // Clear explicit voiceId override and switch to 'es' where only a network voice exists -> false
    engine.applyVoiceSettings({ voiceId: null, rate: 1, pitch: 1, volume: 1 });
    expect(engine.state.onDevice).toBe(true);
    engine.switchLanguage('es');
    expect(engine.state.onDevice).toBe(false);

    // Add a local ES voice and switch recognition probe for 'en-US' to cloud ('unavailable')
    voices = [
      ...voices,
      { id: 'es-local', name: 'Local ES', lang: 'es-ES', local: true },
    ];
    probeStatuses['en-US'] = 'unavailable';
    engine.switchLanguage('en');
    await vi.waitFor(() => expect(engine.state.onDevice).toBe(false));

    engine.destroy();
  });

  it('InputLevelMeter is released on mute (stopping tracks) and re-acquired on unmute, paused on thinking without stopping tracks, stopped on end and destroy, and maps NotAllowedError and NotFoundError', async () => {
    const stopTrack = vi.fn();
    const mockStream = {
      getTracks: () => [{ stop: stopTrack }],
    };
    const getUserMedia = vi.fn().mockResolvedValue(mockStream);
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
      writable: true,
    });

    const closeCtx = vi.fn().mockResolvedValue(undefined);
    const resumeCtx = vi.fn().mockResolvedValue(undefined);
    let sampleVal = Math.pow(10, -30 / 20); // -30 dB => 0.5 mapped level
    let createdCtx: any = null;
    class MockAudioContext {
      state = 'suspended';
      createAnalyser = vi.fn().mockReturnValue({
        fftSize: 256,
        getFloatTimeDomainData: vi.fn((arr: Float32Array) => arr.fill(sampleVal)),
      });
      createMediaStreamSource = vi.fn().mockReturnValue({
        connect: vi.fn(),
        disconnect: vi.fn(),
      });
      resume = resumeCtx;
      close = closeCtx;
      constructor() {
        createdCtx = this;
      }
    }
    (globalThis as any).AudioContext = MockAudioContext;
    (window as any).AudioContext = MockAudioContext;

    const engine = new VoiceEngine();
    stubEngineBasics(engine);

    let resolvePrompt: () => void = () => {};
    vi.spyOn(engine['ai'], 'prompt').mockImplementation(() => {
      return (async function* () {
        await new Promise<void>((r) => { resolvePrompt = r; });
        yield 'Done.';
      })() as any;
    });

    await engine.startSession('en');
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    expect(resumeCtx).toHaveBeenCalledTimes(1);

    // Active while listening and not muted; reading level twice in a row returns the same value (side-effect free)
    const activeLevel1 = engine.getAudioLevels().input;
    const activeLevel2 = engine.getAudioLevels().input;
    expect(activeLevel1).toBeCloseTo(0.5, 5);
    expect(activeLevel2).toBe(activeLevel1);

    // Released on mute -> stops every track, closes context, level is 0; unmute acquires a fresh stream
    engine.setMuted(true);
    expect(engine.getAudioLevels().input).toBe(0);
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(closeCtx).toHaveBeenCalledTimes(1);

    engine.setMuted(false);
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(resumeCtx).toHaveBeenCalledTimes(2));
    expect(engine.getAudioLevels().input).toBeCloseTo(0.5, 5);

    // Also resumes a suspended existing AudioContext when resume() is called after pause()
    engine['meter'].pause();
    createdCtx.state = 'suspended';
    engine['meter'].resume();
    expect(resumeCtx).toHaveBeenCalledTimes(3);

    // Paused on thinking -> level is 0, tracks still live (stopTrack not called again)
    const turn = engine['handleFinalTranscript']('hello');
    await new Promise((r) => setTimeout(r, 0));
    expect(engine.state.status).toBe('thinking');
    expect(engine.getAudioLevels().input).toBe(0);
    expect(stopTrack).toHaveBeenCalledTimes(1);

    // Resumed in resumeListening without re-acquiring stream
    resolvePrompt();
    await turn;
    expect(engine.state.status).toBe('listening');
    expect(engine.getAudioLevels().input).toBeCloseTo(0.5, 5);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(stopTrack).toHaveBeenCalledTimes(1);

    // Stream tracks stopped and context closed on endSession()
    engine.endSession();
    expect(stopTrack).toHaveBeenCalledTimes(2);
    expect(closeCtx).toHaveBeenCalledTimes(2);
    expect(engine.getAudioLevels().input).toBe(0);

    // Also stopped and closed on destroy()
    await engine.startSession('en');
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(3));
    engine.destroy();
    expect(stopTrack).toHaveBeenCalledTimes(3);
    expect(closeCtx).toHaveBeenCalledTimes(3);

    // NotAllowedError maps to mic-blocked (terminal)
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error('Denied'), { name: 'NotAllowedError' }));
    const engineBlocked = new VoiceEngine();
    stubEngineBasics(engineBlocked);
    await engineBlocked.startSession('en');
    await vi.waitFor(() => expect(engineBlocked.state.status).toBe('error'));
    expect(engineBlocked.state.errorCode).toBe('mic-blocked');
    engineBlocked.destroy();

    // NotFoundError maps to mic-not-found (terminal)
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error('No device'), { name: 'NotFoundError' }));
    const engineNotFound = new VoiceEngine();
    stubEngineBasics(engineNotFound);
    await engineNotFound.startSession('en');
    await vi.waitFor(() => expect(engineNotFound.state.status).toBe('error'));
    expect(engineNotFound.state.errorCode).toBe('mic-not-found');
    engineNotFound.destroy();
  });

  it('getAudioLevels() returns output: null with system voices and the synthesizer level when active backend speaks', async () => {
    const systemEngine = new VoiceEngine();
    expect(systemEngine.getAudioLevels()).toEqual({ input: 0, output: null });
    systemEngine.destroy();

    const mockSynth = {
      id: 'kokoro',
      isReady: true,
      init: vi.fn().mockResolvedValue(undefined),
      supportsLang: vi.fn().mockImplementation((lang: string) => lang === 'en'),
      enqueue: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(),
      getVoices: vi.fn().mockReturnValue([]),
      applyVoiceSettings: vi.fn(),
      getVoiceOverrides: vi.fn().mockReturnValue(null),
      getOutputLevel: vi.fn().mockReturnValue(0.42),
      destroy: vi.fn(),
    };
    const pluginEngine = new VoiceEngine({ synthesizer: mockSynth });
    vi.spyOn(pluginEngine['synthesis']['base'], 'enqueue').mockResolvedValue(undefined);
    await pluginEngine['synthesis'].enqueue('Hello', 'en');
    expect(pluginEngine.getAudioLevels()).toEqual({ input: 0, output: 0.42 });
    await pluginEngine['synthesis'].enqueue('Hola', 'es');
    expect(pluginEngine.getAudioLevels()).toEqual({ input: 0, output: null });
    pluginEngine.destroy();
  });
});

