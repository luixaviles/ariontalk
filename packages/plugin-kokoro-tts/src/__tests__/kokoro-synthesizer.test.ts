import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KokoroSynthesizer, _clearModelCache } from '../kokoro-synthesizer.js';
import { kokoroTtsPlugin } from '../kokoro-tts-plugin.js';

let mockFromPretrained: any;
let mockGenerate: any;

vi.mock('kokoro-js', () => {
  return {
    KokoroTTS: {
      from_pretrained: (...args: any[]) => mockFromPretrained(...args),
    },
  };
});

// The plugin configures the ONNX runtime unconditionally, so every test now
// reaches this import. Mocked to keep the real package (and onnxruntime-web)
// out of jsdom, and so `env` can be asserted on.
let mockEnv: any;
let mockEnvThrows = false;
vi.mock('@huggingface/transformers', () => ({
  get env() {
    if (mockEnvThrows) throw new Error('transformers unavailable');
    return mockEnv;
  },
}));

function setupMockAudioContext() {
  const sources: any[] = [];
  const createdBuffers: any[] = [];

  class MockAudioBufferSourceNode {
    buffer: any = null;
    onended: (() => void) | null = null;
    stop = vi.fn().mockImplementation(() => {
      // Do not trigger onended automatically
    });
    start = vi.fn().mockImplementation(() => {
      // Manual trigger of onended in tests
    });
    connect = vi.fn();
    constructor() {
      sources.push(this);
    }
  }

  class MockGainNode {
    gain = { value: 1.0 };
    connect = vi.fn();
  }

  class MockAnalyserNode {
    fftSize = 256;
    connect = vi.fn();
    sampleValue = 0.35;
    getFloatTimeDomainData = vi.fn().mockImplementation((arr: Float32Array) => {
      arr.fill(this.sampleValue);
    });
  }

  const contexts: any[] = [];
  const analysers: MockAnalyserNode[] = [];
  class MockAudioContext {
    state = 'running';
    destination = {};
    createGain = vi.fn().mockImplementation(() => new MockGainNode());
    createAnalyser = vi.fn().mockImplementation(() => {
      const a = new MockAnalyserNode();
      analysers.push(a);
      return a;
    });
    createBuffer = vi.fn().mockImplementation((channels: number, length: number, sampleRate: number) => {
      const buf = {
        numberOfChannels: channels,
        length,
        sampleRate,
        copyToChannel: vi.fn(),
      };
      createdBuffers.push(buf);
      return buf;
    });
    createBufferSource = vi.fn().mockImplementation(() => new MockAudioBufferSourceNode());
    resume = vi.fn().mockImplementation(() => Promise.resolve());
    close = vi.fn().mockImplementation(() => Promise.resolve());
    constructor() {
      contexts.push(this);
    }
  }

  (globalThis as any).AudioContext = MockAudioContext;

  return { sources, createdBuffers, contexts, analysers };
}

describe('KokoroSynthesizer', () => {
  let synth: KokoroSynthesizer;

  beforeEach(() => {
    _clearModelCache();
    mockEnv = { backends: { onnx: { wasm: {} } }, remoteHost: undefined };
    mockEnvThrows = false;
    mockGenerate = vi.fn().mockImplementation(() =>
      Promise.resolve({
        audio: new Float32Array(100),
        sampling_rate: 24000,
      })
    );
    mockFromPretrained = vi.fn().mockImplementation(() =>
      Promise.resolve({
        generate: mockGenerate,
      })
    );
    setupMockAudioContext();
    // The plugin requires WebGPU and jsdom has none, so without this every test
    // would fail at load rather than exercising what it is about. Tests that
    // cover the absence of WebGPU delete it again themselves.
    Object.defineProperty(globalThis.navigator, 'gpu', { value: {}, configurable: true });
    synth = new KokoroSynthesizer({ defaultVoice: 'af_heart' });
  });

  afterEach(() => {
    synth.destroy();
    Reflect.deleteProperty(globalThis.navigator, 'gpu');
  });

  it('1. enqueue resolves after onended fires, not before', async () => {
    const { sources } = setupMockAudioContext();
    await synth.init();

    let resolved = false;
    const promise = synth.enqueue('Hello world', 'en').then(() => { resolved = true; });

    await vi.waitFor(() => expect(sources.length).toBe(1));
    expect(resolved).toBe(false);

    sources[0].onended();
    await promise;
    expect(resolved).toBe(true);
  });

  it('2. onStart fires after src.start(), and only once', async () => {
    const { sources } = setupMockAudioContext();
    await synth.init();

    let startedAtOnStart = false;
    const onStart = vi.fn().mockImplementation(() => {
      startedAtOnStart = sources[0]?.start.mock.calls.length > 0;
    });
    const promise = synth.enqueue('Hello world', 'en', { onStart });

    await vi.waitFor(() => expect(sources.length).toBe(1));
    expect(startedAtOnStart).toBe(true);
    expect(onStart).toHaveBeenCalledTimes(1);
    const expectedDurationMs = Math.round((100 / 24000) * 1000);
    expect(onStart).toHaveBeenCalledWith({ durationMs: expectedDurationMs });
    expect(sources[0].start).toHaveBeenCalled();

    sources[0].onended();
    await promise;
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('3. Three enqueued utterances play in order; second does not start until first onended fires', async () => {
    const { sources } = setupMockAudioContext();
    await synth.init();

    const p1 = synth.enqueue('First', 'en');
    const p2 = synth.enqueue('Second', 'en');
    const p3 = synth.enqueue('Third', 'en');

    await vi.waitFor(() => expect(sources.length).toBe(1));
    expect(sources.length).toBe(1);

    // End first utterance
    sources[0].onended();
    await vi.waitFor(() => expect(sources.length).toBe(2));

    // End second utterance
    sources[1].onended();
    await vi.waitFor(() => expect(sources.length).toBe(3));

    // End third utterance
    sources[2].onended();
    await Promise.all([p1, p2, p3]);
  });

  it('4. Generation runs ahead: with lookahead 2, generate() is called for job 2 while job 1 is playing', async () => {
    await synth.init();
    mockGenerate.mockClear();

    synth.enqueue('First', 'en');
    synth.enqueue('Second', 'en');
    synth.enqueue('Third', 'en');

    await vi.waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(2)); // Job 1 & Job 2 generated
    expect(mockGenerate.mock.calls[0][0]).toBe('First');
    expect(mockGenerate.mock.calls[1][0]).toBe('Second');
  });

  it('5. cancel() resolves every pending promise', async () => {
    const { sources } = setupMockAudioContext();
    await synth.init();

    let r1 = false, r2 = false;
    synth.enqueue('First', 'en').then(() => { r1 = true; });
    synth.enqueue('Second', 'en').then(() => { r2 = true; });

    await vi.waitFor(() => expect(sources.length).toBe(1));
    synth.cancel();

    await vi.waitFor(() => {
      expect(r1).toBe(true);
      expect(r2).toBe(true);
    });
  });

  it('6. cancel() calls src.stop() and late onended does not double-resolve or restart pump', async () => {
    const { sources } = setupMockAudioContext();
    await synth.init();

    synth.enqueue('First', 'en');
    await vi.waitFor(() => expect(sources.length).toBe(1));

    const src = sources[0];
    synth.cancel();

    expect(src.stop).toHaveBeenCalled();
    expect(src.onended).toBeNull();
  });

  it('7. A generate() resolving after cancel() is discarded and never played', async () => {
    await synth.init();
    let resolveGen: (val: any) => void = () => {};
    mockGenerate.mockImplementation(() => new Promise((r) => { resolveGen = r; }));

    const p = synth.enqueue('Slow utterance', 'en');
    synth.cancel();
    resolveGen({ audio: new Float32Array(50), sampling_rate: 24000 });

    await p;
    expect(synth['queue'].length).toBe(0);
  });

  it('8. init() failure leaves isReady === false and does not throw', async () => {
    mockFromPretrained.mockRejectedValue(new Error('Network error loading ONNX model'));
    const synthFail = new KokoroSynthesizer({ modelId: 'fail-model-88' });

    await expect(synthFail.init()).resolves.toBeUndefined();
    expect(synthFail.isReady).toBe(false);
  });

  it('9. WebGPU init failure does not retry on wasm', async () => {
    // Retrying would keep dtype at fp32 and run 325MB of full-precision weights
    // on the slowest backend, which is worse than the q8 default it replaced.
    let callCount = 0;
    mockFromPretrained.mockImplementation((_id: string, opts: any) => {
      callCount++;
      if (opts.device === 'webgpu') return Promise.reject(new Error('WebGPU unavailable'));
      return Promise.resolve({ generate: mockGenerate });
    });

    const synthWebGpu = new KokoroSynthesizer({ device: 'webgpu', modelId: 'test-gpu-nofallback' });
    await synthWebGpu.init();

    expect(callCount).toBe(1);
    expect(synthWebGpu.isReady).toBe(false);
  });

  it('9b. defaults to webgpu+fp32, and never pairs a quantized dtype with webgpu', async () => {
    // Quantized weights on the WebGPU EP return a waveform full of wrong
    // samples rather than failing, so the pairing must be unreachable, not
    // merely discouraged.
    await new KokoroSynthesizer({ modelId: 'test-defaults' }).init();
    expect(mockFromPretrained).toHaveBeenLastCalledWith(
      'test-defaults',
      expect.objectContaining({ device: 'webgpu', dtype: 'fp32' }),
    );

    // Explicit webgpu coerces the dtype to fp32 rather than honouring q8.
    await new KokoroSynthesizer({ modelId: 'test-gpu', device: 'webgpu', dtype: 'q8' }).init();
    expect(mockFromPretrained).toHaveBeenLastCalledWith(
      'test-gpu',
      expect.objectContaining({ device: 'webgpu', dtype: 'fp32' }),
    );
  });

  it('10. applyVoiceSettings clamps rate, sets gain, and ignores pitch', async () => {
    await synth.init();

    synth.applyVoiceSettings({
      voiceId: 'af_bella',
      rate: 3.0, // should clamp to 2.0
      pitch: 1.8, // should be ignored for synth
      volume: 0.5,
    });

    const overrides = synth.getVoiceOverrides();
    expect(overrides?.voiceId).toBe('af_bella');
    expect(overrides?.rate).toBe(2.0);
    expect(overrides?.pitch).toBe(1.0);
    expect(overrides?.volume).toBe(0.5);
  });

  it('11. supportsLang is true for en and auto, false for es', () => {
    expect(synth.supportsLang('en')).toBe(true);
    expect(synth.supportsLang('en-US')).toBe(true);
    expect(synth.supportsLang('en-GB')).toBe(true);
    expect(synth.supportsLang('auto')).toBe(true);
    expect(synth.supportsLang('es')).toBe(false);
    expect(synth.supportsLang('fr')).toBe(false);
  });

  it('12. preload() followed by init() calls from_pretrained once, not twice', async () => {
    mockFromPretrained.mockClear();
    const opts = { modelId: 'once-model-123' };

    await KokoroSynthesizer.preload(opts);
    const synthSingle = new KokoroSynthesizer(opts);
    await synthSingle.init();

    expect(mockFromPretrained).toHaveBeenCalledTimes(1);
  });

  it('13. preload() rejects when loading fails, while init() on same failure resolves cleanly', async () => {
    mockFromPretrained.mockRejectedValue(new Error('CDN error'));
    const opts = { modelId: 'reject-model-99' };

    await expect(KokoroSynthesizer.preload(opts)).rejects.toThrow('CDN error');

    const synthSilent = new KokoroSynthesizer(opts);
    await expect(synthSilent.init()).resolves.toBeUndefined();
    expect(synthSilent.isReady).toBe(false);
  });

  it('14. status() returns unknown before attempt, failed after a failed one', async () => {
    const opts = { modelId: 'status-model-77' };
    expect(KokoroSynthesizer.status(opts)).toBe('unknown');

    mockFromPretrained.mockRejectedValue(new Error('404'));
    await KokoroSynthesizer.preload(opts).catch(() => {});

    expect(KokoroSynthesizer.status(opts)).toBe('failed');
  });

  it('15. A failed load is not retried by a subsequent init(), but a subsequent preload() does retry', async () => {
    const opts = { modelId: 'retry-model-44' };
    mockFromPretrained.mockRejectedValueOnce(new Error('Initial failure'));

    await KokoroSynthesizer.preload(opts).catch(() => {});
    expect(KokoroSynthesizer.status(opts)).toBe('failed');

    // Subsequent init() does NOT retry
    mockFromPretrained.mockResolvedValueOnce({ generate: mockGenerate });
    const synthNoRetry = new KokoroSynthesizer(opts);
    await synthNoRetry.init();
    expect(synthNoRetry.isReady).toBe(false);

    // Subsequent preload() DOES retry
    await KokoroSynthesizer.preload(opts);
    expect(KokoroSynthesizer.status(opts)).toBe('ready');
  });

  it('16. a failing generate() is attempted once, not retried', async () => {
    await synth.init();
    mockGenerate.mockClear();
    mockGenerate.mockImplementation(() => new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Inference failure')), 1);
    }));

    const p = synth.enqueue('Failing utterance', 'en');
    await p;

    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it('17. a failing generate() still resolves the enqueue promise', async () => {
    await synth.init();
    mockGenerate.mockImplementation(() => new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Inference failure')), 1);
    }));

    let resolved = false;
    const p = synth.enqueue('Failing utterance', 'en').then(() => { resolved = true; });
    await p;

    expect(resolved).toBe(true);
  });

  it('18. a failed utterance does not block the ones behind it', async () => {
    const { sources } = setupMockAudioContext();
    await synth.init();

    mockGenerate.mockImplementation((text: string) => {
      if (text === 'Fail') {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Synthesis error')), 1);
        });
      }
      return Promise.resolve({
        audio: new Float32Array(100),
        sampling_rate: 24000,
      });
    });

    let failResolved = false;
    let okResolved = false;

    const p1 = synth.enqueue('Fail', 'en').then(() => { failResolved = true; });
    const p2 = synth.enqueue('Pass', 'en').then(() => { okResolved = true; });

    await vi.waitFor(() => expect(sources.length).toBe(1));
    sources[0].onended();

    await Promise.all([p1, p2]);

    expect(failResolved).toBe(true);
    expect(okResolved).toBe(true);
  });

  it('19. init() with no AudioContext leaves isReady false', async () => {
    delete (globalThis as any).AudioContext;
    if (typeof window !== 'undefined') {
      delete (window as any).AudioContext;
    }

    const synthNoAudio = new KokoroSynthesizer();
    await synthNoAudio.init();

    expect(synthNoAudio.isReady).toBe(false);
  });

  it('20. cancel() mid-generate does not let a second pump double-generate the next utterance', async () => {
    const { sources } = setupMockAudioContext();
    await synth.init();

    // Slow enough that cancel() lands while pump() is still awaiting generate().
    mockGenerate.mockImplementation(() => new Promise((resolve) => {
      setTimeout(() => resolve({ audio: new Float32Array(100), sampling_rate: 24000 }), 40);
    }));

    const interrupted = synth.enqueue('Utterance from the interrupted turn', 'en');
    await new Promise((r) => setTimeout(r, 10));

    mockGenerate.mockClear();

    // voice-engine cancels and then enqueues the next turn milliseconds later.
    synth.cancel();
    const next = synth.enqueue('Utterance from the new turn', 'en');

    await vi.waitFor(() => expect(sources.length).toBe(1), { timeout: 1000 });
    sources[0].onended();
    await Promise.all([interrupted, next]);

    const nextCalls = mockGenerate.mock.calls
      .filter(([text]: [string]) => text === 'Utterance from the new turn');
    expect(nextCalls).toHaveLength(1);
  });

  it('21. wasm.proxy is true before the session is created, so inference never runs on the main thread', async () => {
    // Captured inside the mock: proxy is read at session construction, so
    // asserting it afterwards would pass even if it were set too late.
    let proxyAtSessionCreation: boolean | undefined;
    mockFromPretrained.mockImplementation(() => {
      proxyAtSessionCreation = mockEnv.backends.onnx.wasm.proxy;
      return Promise.resolve({ generate: mockGenerate });
    });

    await new KokoroSynthesizer({ modelId: 'test-proxy', device: 'wasm' }).init();

    expect(proxyAtSessionCreation).toBe(true);
  });

  it('22. proxy is set even when no wasmPaths or remoteHost is passed', async () => {
    // The env block used to be gated behind those two options, which would have
    // left a plain wasm configuration blocking the main thread.
    await new KokoroSynthesizer({ modelId: 'test-proxy-default', device: 'wasm' }).init();

    expect(mockEnv.backends.onnx.wasm.proxy).toBe(true);
    expect(mockEnv.backends.onnx.wasm.wasmPaths).toBeUndefined();
  });

  it('23. proxy is left alone on webgpu, which rejects non-CPU tensors in proxied sessions', async () => {
    await new KokoroSynthesizer({ modelId: 'test-proxy-gpu', device: 'webgpu' }).init();

    expect(mockEnv.backends.onnx.wasm.proxy).toBeUndefined();
  });

  it('24. a failing transformers import still loads the model', async () => {
    mockEnvThrows = true;

    const synthNoEnv = new KokoroSynthesizer({ modelId: 'test-no-env' });
    await synthNoEnv.init();

    expect(synthNoEnv.isReady).toBe(true);
  });

  it('25. playback starts as soon as the head is ready, without waiting for the lookahead buffer to fill', async () => {
    // Regression: drainAndPlay() used to run only after the generation loop
    // exited, and the loop does not exit until `lookahead` utterances are
    // ready. Measured in the demo, that held the first sentence finished and
    // silent for 6.2s while the second was synthesized.
    const { sources } = setupMockAudioContext();
    await synth.init();

    // The second utterance never finishes. If playback waits for the buffer to
    // fill, the first one is never heard at all.
    mockGenerate.mockImplementation((text: string) =>
      text === 'first'
        ? Promise.resolve({ audio: new Float32Array(100), sampling_rate: 24000 })
        : new Promise(() => {}),
    );

    void synth.enqueue('first', 'en');
    void synth.enqueue('second', 'en');

    await vi.waitFor(() => expect(sources.length).toBe(1), { timeout: 1000 });
    expect(sources[0].start).toHaveBeenCalled();
  });

  it('26. without WebGPU, preload rejects and nothing is downloaded', async () => {
    // The assertion that matters is the call count. from_pretrained fetches the
    // weights and only then builds the session, so reaching it at all would pull
    // 325MB onto a machine that cannot use them.
    Reflect.deleteProperty(globalThis.navigator, 'gpu');

    await expect(KokoroSynthesizer.preload({ modelId: 'test-no-gpu' })).rejects.toThrow(/WebGPU/);
    expect(mockFromPretrained).not.toHaveBeenCalled();
  });

  it('27. without WebGPU, status() is failed and init() degrades without throwing', async () => {
    Reflect.deleteProperty(globalThis.navigator, 'gpu');

    const synthNoGpu = new KokoroSynthesizer({ modelId: 'test-no-gpu-init' });
    await expect(synthNoGpu.init()).resolves.toBeUndefined();

    expect(synthNoGpu.isReady).toBe(false);
    expect(KokoroSynthesizer.status({ modelId: 'test-no-gpu-init' })).toBe('failed');
  });

  it('28. an explicit device: wasm still works and keeps q8', async () => {
    // Supported for non-interactive use such as pre-generating audio, where a
    // 17x slowdown does not matter and 86MB instead of 325MB does.
    Reflect.deleteProperty(globalThis.navigator, 'gpu');

    const synthWasm = new KokoroSynthesizer({ modelId: 'test-wasm-opt-in', device: 'wasm' });
    await synthWasm.init();

    expect(synthWasm.isReady).toBe(true);
    expect(mockFromPretrained).toHaveBeenLastCalledWith(
      'test-wasm-opt-in',
      expect.objectContaining({ device: 'wasm', dtype: 'q8' }),
    );
  });

  it('29. progress follows the largest file, so a small one finishing first cannot pin it at 100%', async () => {
    let capturedCallback: any;
    let resolveLoad: (val: any) => void = () => {};
    mockFromPretrained.mockImplementation((_id: string, opts: any) => {
      capturedCallback = opts.progress_callback;
      return new Promise((resolve) => { resolveLoad = resolve; });
    });

    const progressReports: number[] = [];
    const onProgress = vi.fn((p) => progressReports.push(p));

    const p = KokoroSynthesizer.preload({ modelId: 'test-progress-agg' }, onProgress);

    // Nothing measurable yet.
    expect(progressReports[0]).toBe(-1);

    await vi.waitFor(() => expect(capturedCallback).toBeDefined());

    // Small config completes first
    capturedCallback({ status: 'progress', file: 'config.json', loaded: 400, total: 400 });
    expect(progressReports[progressReports.length - 1]).toBe(1);

    capturedCallback({ status: 'progress', file: 'model.onnx', loaded: 32_553_223, total: 325_532_232 });
    expect(progressReports[progressReports.length - 1]).toBeCloseTo(0.1, 5);

    capturedCallback({ status: 'progress', file: 'model.onnx', loaded: 162_766_116, total: 325_532_232 });
    expect(progressReports[progressReports.length - 1]).toBeCloseTo(0.5, 5);

    // Secondary files do not override largest file progress
    capturedCallback({ status: 'progress', file: 'tokenizer.json', loaded: 1200, total: 1200 });
    expect(progressReports[progressReports.length - 1]).toBeCloseTo(0.5, 5);

    capturedCallback({ status: 'progress', file: 'model.onnx', loaded: 325_532_232, total: 325_532_232 });
    expect(progressReports[progressReports.length - 1]).toBe(1);

    expect(progressReports.filter((r) => r > 0 && r < 1).length).toBe(3);

    resolveLoad({ generate: mockGenerate });
    await p;
  });

  it('30. replays last progress to late subscriber while load is in-flight', async () => {
    let capturedCallback: any;
    let resolveLoad: (val: any) => void = () => {};
    mockFromPretrained.mockImplementation((_id: string, opts: any) => {
      capturedCallback = opts.progress_callback;
      return new Promise((resolve) => { resolveLoad = resolve; });
    });

    const p1 = KokoroSynthesizer.preload({ modelId: 'test-late-sub' });
    await vi.waitFor(() => expect(capturedCallback).toBeDefined());

    // Progress updates to 0.6
    capturedCallback({ status: 'progress', file: 'model.onnx', loaded: 60, total: 100 });

    // Late subscriber joins while load is still in-flight
    const lateReports: number[] = [];
    const p2 = KokoroSynthesizer.preload({ modelId: 'test-late-sub' }, (p) => lateReports.push(p));

    // Replays 0.6 immediately
    expect(lateReports).toEqual([0.6]);

    // Subsequent progress reaches late subscriber
    capturedCallback({ status: 'progress', file: 'model.onnx', loaded: 80, total: 100 });
    expect(lateReports).toEqual([0.6, 0.8]);

    resolveLoad({ generate: mockGenerate });
    await Promise.all([p1, p2]);
  });

  it('31. init() is idempotent: a second call reuses the first AudioContext', async () => {
    const { contexts } = setupMockAudioContext();
    await synth.init();
    await synth.init();
    expect(contexts.length).toBe(1);
    expect(mockFromPretrained).toHaveBeenCalledTimes(1);
  });

  it('32. progress subscribers are cleared and not invoked after load settles', async () => {
    let capturedCallback: any;
    let resolveLoad: (val: any) => void = () => {};
    mockFromPretrained.mockImplementation((_id: string, opts: any) => {
      capturedCallback = opts.progress_callback;
      return new Promise((resolve) => { resolveLoad = resolve; });
    });

    const sub1Calls: number[] = [];
    const sub2Calls: number[] = [];

    const p1 = KokoroSynthesizer.preload({ modelId: 'test-subs-cleared' }, (p) => sub1Calls.push(p));
    await vi.waitFor(() => expect(capturedCallback).toBeDefined());

    capturedCallback({ status: 'progress', file: 'model.onnx', loaded: 50, total: 100 });

    const p2 = KokoroSynthesizer.preload({ modelId: 'test-subs-cleared' }, (p) => sub2Calls.push(p));
    expect(sub2Calls).toEqual([0.5]);

    // Load settles
    resolveLoad({ generate: mockGenerate });
    await Promise.all([p1, p2]);

    const sub1Count = sub1Calls.length;
    const sub2Count = sub2Calls.length;

    // Further callback calls should not reach subscribers
    capturedCallback({ status: 'progress', file: 'model.onnx', loaded: 100, total: 100 });

    expect(sub1Calls.length).toBe(sub1Count);
    expect(sub2Calls.length).toBe(sub2Count);
  });

  it('33. Two ready jobs: job2.onStart fires synchronously on ended and job1 resolves next tick', async () => {
    const { sources } = setupMockAudioContext();
    await synth.init();
    mockGenerate.mockClear();

    let job1Resolved = false;
    let job2StartedBeforeOnStart = false;
    const events: string[] = [];

    const p1 = synth.enqueue('First', 'en', {
      onStart: () => { events.push('job1.onStart'); },
    }).then(() => {
      job1Resolved = true;
      events.push('job1.resolved');
    });

    await vi.waitFor(() => expect(sources.length).toBe(1));

    const p2 = synth.enqueue('Second', 'en', {
      onStart: () => {
        events.push('job2.onStart');
        job2StartedBeforeOnStart = sources[1]?.start.mock.calls.length > 0;
      },
    });

    await vi.waitFor(() => expect((synth as any).queue[1]?.state).toBe('ready'));

    sources[0].onended();

    expect(events).toContain('job2.onStart');
    expect(job2StartedBeforeOnStart).toBe(true);
    expect(job1Resolved).toBe(false);

    await p1;
    expect(job1Resolved).toBe(true);

    sources[1].onended();
    await p2;
  });

  it('34. A throwing onStart listener does not unwind the playing job', async () => {
    const { sources } = setupMockAudioContext();
    await synth.init();

    let resolved = false;
    const promise = synth.enqueue('Hello world', 'en', {
      onStart: () => { throw new Error('listener failed'); },
    }).then(() => { resolved = true; });

    await vi.waitFor(() => expect(sources.length).toBe(1));
    await new Promise((r) => setTimeout(r, 0));

    expect(sources[0].start).toHaveBeenCalledTimes(1);
    expect(resolved).toBe(false);
    expect((synth as any).queue.length).toBe(1);

    sources[0].onended();
    await promise;
    expect(resolved).toBe(true);
  });

  it('35. isSupported() is false only for a webgpu backend without navigator.gpu', () => {
    expect(KokoroSynthesizer.isSupported()).toBe(true);
    expect(KokoroSynthesizer.isSupported({ device: 'webgpu' })).toBe(true);
    expect(KokoroSynthesizer.isSupported({ device: 'wasm' })).toBe(true);
    expect(kokoroTtsPlugin().isSupported?.()).toBe(true);
    expect(kokoroTtsPlugin().unsupportedReason).toBe(
      "Kokoro needs WebGPU, which this browser doesn't support.",
    );

    Reflect.deleteProperty(globalThis.navigator, 'gpu');

    expect(KokoroSynthesizer.isSupported()).toBe(false);
    expect(KokoroSynthesizer.isSupported({ device: 'webgpu' })).toBe(false);
    expect(KokoroSynthesizer.isSupported({ device: 'wasm' })).toBe(true);
    expect(kokoroTtsPlugin().isSupported?.()).toBe(false);
    expect(kokoroTtsPlugin({ device: 'wasm' }).isSupported?.()).toBe(true);
  });

  it('36. getOutputLevel() returns 0 when idle, maps RMS to perceptual dB level while playing without side effects, and connects source -> analyser -> gain', async () => {
    const { sources, analysers } = setupMockAudioContext();
    expect(synth.getOutputLevel()).toBe(0);

    await synth.init();
    expect(synth.getOutputLevel()).toBe(0);
    expect(analysers[0].connect).toHaveBeenCalledWith((synth as any).gainNode);

    const p = synth.enqueue('Hello world', 'en');
    await vi.waitFor(() => expect(sources.length).toBe(1));
    expect(sources[0].connect).toHaveBeenCalledWith(analysers[0]);

    // 0.35 RMS => 20 * log10(0.35) = -9.1186 dB => above -10 dB ceiling => clamped to 1
    expect(synth.getOutputLevel()).toBe(1);

    // -30 dB RMS => 0.5 mapped level, and reading twice returns the exact same value
    analysers[0].sampleValue = Math.pow(10, -30 / 20);
    const level1 = synth.getOutputLevel();
    const level2 = synth.getOutputLevel();
    expect(level1).toBeCloseTo(0.5, 5);
    expect(level2).toBe(level1);

    // Clamps to 1 when RMS exceeds 1
    analysers[0].sampleValue = 2.0;
    expect(synth.getOutputLevel()).toBe(1);

    sources[0].onended();
    await p;
    expect(synth.getOutputLevel()).toBe(0);
  });
});
