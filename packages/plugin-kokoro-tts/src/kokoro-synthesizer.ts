import {
  analyserRms,
  createLogger,
  rmsToLevel,
  type AnalyserScratch,
  type SpeechSynthesizer,
  type SpeechSynthesizerOptions,
  type SupportedLang,
  type VoiceInfo,
  type VoiceSettings,
} from '@ariontalk/core';

const log = createLogger('kokoro');

export interface KokoroTtsOptions {
  /** @default 'onnx-community/Kokoro-82M-v1.0-ONNX' */
  modelId?: string;
  /**
   * Weight precision. Forced to 'fp32' on 'webgpu', the only pairing the model
   * supports there, which is why the default download is 325MB rather than 86MB.
   * @default 'fp32' on webgpu, 'q8' on wasm
   */
  dtype?: 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16';
  /**
   * Inference backend. 'wasm' is supported for non-interactive use such as
   * pre-generating audio, but it is roughly 17x slower than 'webgpu' (measured
   * RTF 2.66 against 0.16) and cannot keep up with live conversation.
   * @default 'webgpu'
   */
  device?: 'wasm' | 'webgpu';
  /** Voice IDs to expose. @default the nine curated voices */
  voices?: string[];
  /** @default 'af_heart' */
  defaultVoice?: string;
  /** Base path for ONNX Runtime WASM binaries. Leave unset to use the CDN. */
  wasmPaths?: string;
  /** Base URL for model weights. Leave unset to use the Hugging Face Hub. */
  remoteHost?: string;
  /** How many utterances to synthesize ahead of playback. @default 2 */
  lookahead?: number;
}

export type KokoroLoadStatus = 'unknown' | 'loading' | 'ready' | 'failed';

export const DEFAULT_KOKORO_VOICES: VoiceInfo[] = [
  { id: 'af_heart', name: 'Heart', lang: 'en-US', local: true, group: 'American English' },
  { id: 'af_bella', name: 'Bella', lang: 'en-US', local: true, group: 'American English' },
  { id: 'af_nicole', name: 'Nicole', lang: 'en-US', local: true, group: 'American English' },
  { id: 'bf_emma', name: 'Emma', lang: 'en-GB', local: true, group: 'British English' },
  { id: 'am_michael', name: 'Michael', lang: 'en-US', local: true, group: 'American English' },
  { id: 'am_fenrir', name: 'Fenrir', lang: 'en-US', local: true, group: 'American English' },
  { id: 'am_puck', name: 'Puck', lang: 'en-US', local: true, group: 'American English' },
  { id: 'bm_george', name: 'George', lang: 'en-GB', local: true, group: 'British English' },
  { id: 'bm_fable', name: 'Fable', lang: 'en-GB', local: true, group: 'British English' },
];

interface ModelCacheEntry {
  status: KokoroLoadStatus;
  promise: Promise<any> | null;
  lastProgress?: number;
  subscribers?: Set<(loaded: number) => void>;
}

const modelCache = new Map<string, ModelCacheEntry>();

export function _clearModelCache(): void {
  modelCache.clear();
}

const DEFAULT_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';

function hasWebGpu(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as any).gpu;
}

/**
 * Resolves the backend pair. Quantized weights are numerically unreliable on
 * the WebGPU execution provider: inference succeeds and returns a waveform,
 * but the samples are wrong, so the audio comes out as near-silence with
 * bursts of unrelated phonemes rather than as an error. kokoro-js only
 * sanctions fp32 there, so 'webgpu' implies fp32 regardless of what was asked.
 *
 * Pure by design: getCacheKey() runs on every settings-panel render via
 * status(), so this must not log or touch anything.
 */
function resolveBackend(options?: KokoroTtsOptions): {
  device: 'wasm' | 'webgpu';
  dtype: NonNullable<KokoroTtsOptions['dtype']>;
  coerced: boolean;
} {
  const device = options?.device ?? 'webgpu';
  const requested = options?.dtype ?? 'q8';
  const coerced = device === 'webgpu' && requested !== 'fp32';
  return { device, dtype: coerced ? 'fp32' : requested, coerced };
}

function getCacheKey(options?: KokoroTtsOptions): string {
  const modelId = options?.modelId ?? DEFAULT_MODEL_ID;
  const { device, dtype } = resolveBackend(options);
  return `${modelId}|${dtype}|${device}`;
}

export function listKokoroVoices(customVoiceIds?: string[]): VoiceInfo[] {
  if (!customVoiceIds || customVoiceIds.length === 0) {
    return DEFAULT_KOKORO_VOICES;
  }
  return customVoiceIds.map((id) => {
    const matched = DEFAULT_KOKORO_VOICES.find((v) => v.id === id);
    if (matched) return matched;
    const isBritish = id.startsWith('bf_') || id.startsWith('bm_');
    return {
      id,
      name: id,
      lang: isBritish ? 'en-GB' : 'en-US',
      local: true,
      group: isBritish ? 'British English' : 'American English',
    };
  });
}

/**
 * Reads a kokoro-js RawAudio. Named properties are `.audio` / `.sampling_rate`
 * on the installed version; the fallbacks cover older and future shapes.
 */
function readRawAudio(raw: any): { data: any; sampleRate: number } {
  return {
    data: raw?.audio ?? raw?.waveform ?? raw?.data,
    sampleRate: raw?.sampling_rate ?? raw?.sample_rate ?? 24000,
  };
}

/**
 * Debug timing for one utterance. The number that matters is the real-time
 * factor: generation time divided by the duration of the audio produced.
 * Below 1.0 means synthesis outruns playback, so `lookahead` can hide it and
 * only the first utterance of a turn is ever waited on. Above 1.0 means the
 * queue can never catch up and every utterance adds delay.
 */
function logSynthesisTiming(text: string, raw: any, elapsedMs: number): void {
  const { data, sampleRate } = readRawAudio(raw);
  const audioSec = data?.length ? data.length / sampleRate : 0;
  const rtf = audioSec > 0 ? elapsedMs / 1000 / audioSec : NaN;
  log.debug(
    `synth ${Math.round(elapsedMs)}ms | ${text.length} chars | ${audioSec.toFixed(2)}s audio | RTF ${rtf.toFixed(2)}`,
  );
}

interface QueueJob {
  text: string;
  voice: string;
  speed: number;
  onStart?: (meta?: { durationMs?: number }) => void;
  resolve: () => void;
  generation: number;
  state: 'pending' | 'ready' | 'failed';
  audio?: any;
}

export class KokoroSynthesizer implements SpeechSynthesizer {
  readonly id = 'kokoro';
  isReady = false;

  private ttsInstance: any = null;
  private audioCtx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private scratch: AnalyserScratch = {};
  private currentSource: AudioBufferSourceNode | null = null;
  private initPromise: Promise<void> | null = null;

  private currentVoice: string;
  private speed = 1.0;
  private volume = 1.0;

  private queue: QueueJob[] = [];
  private currentGeneration = 0;
  private isPumping = false;
  private isPlaying = false;
  private lookahead: number;
  /** Start of the current run of utterances, for the time-to-first-audio log. */
  private batchStartedAt = 0;

  constructor(private readonly options?: KokoroTtsOptions) {
    this.currentVoice = options?.defaultVoice ?? 'af_heart';
    this.lookahead = options?.lookahead ?? 2;
  }

  static isSupported(options?: KokoroTtsOptions): boolean {
    return resolveBackend(options).device !== 'webgpu' || hasWebGpu();
  }

  static status(options?: KokoroTtsOptions): KokoroLoadStatus {
    const key = getCacheKey(options);
    const entry = modelCache.get(key);
    return entry?.status ?? 'unknown';
  }

  static async preload(options?: KokoroTtsOptions, onProgress?: (loaded: number) => void): Promise<void> {
    const key = getCacheKey(options);
    let entry = modelCache.get(key);

    if (entry?.status === 'failed') {
      modelCache.delete(key);
      entry = undefined;
    }

    if (entry?.status === 'ready' && entry.promise) {
      if (onProgress) {
        onProgress(1);
      }
      await entry.promise;
      return;
    }

    if (entry?.status === 'loading' && entry.promise) {
      if (onProgress) {
        entry.subscribers?.add(onProgress);
        if (entry.lastProgress !== undefined) {
          onProgress(entry.lastProgress);
        }
      }
      await entry.promise;
      return;
    }

    const subscribers = new Set<(loaded: number) => void>();
    if (onProgress) subscribers.add(onProgress);

    const newEntry: ModelCacheEntry = {
      status: 'loading',
      promise: null,
      lastProgress: -1,
      subscribers,
    };

    const reportProgress = (p: number) => {
      newEntry.lastProgress = p;
      if (newEntry.subscribers) {
        for (const sub of newEntry.subscribers) {
          try { sub(p); } catch {}
        }
      }
    };

    // Default to -1 (unknown) until download progress reports.
    reportProgress(-1);

    const loadPromise = (async () => {
      try {
        const { KokoroTTS } = await import('kokoro-js');
        const modelId = options?.modelId ?? DEFAULT_MODEL_ID;
        const backend = resolveBackend(options);
        const dtype = backend.dtype;
        const device = backend.device;

        // Checked before from_pretrained, which downloads the weights and only
        // then builds the session. Without this, a machine that cannot use
        // WebGPU would pull 325MB before discovering it. Rejecting here marks
        // the cache entry failed, which surfaces as the "unavailable, using
        // system voices" note and routes the composite to the system backend.
        if (device === 'webgpu' && !hasWebGpu()) {
          throw new Error('Kokoro TTS requires WebGPU, which is unavailable in this browser.');
        }

        if (backend.coerced) {
          log.warn(`dtype "${options?.dtype}" is not usable on WebGPU; loading fp32 instead (a larger download).`);
        }

        // Runtime configuration. Must happen before the inference session is
        // created: `proxy` is read at construction, so setting it afterwards is
        // a silent no-op.
        //
        // This reaches transformers.js through our own import while kokoro-js
        // imports its own copy. It works because both resolve to the single
        // installed @huggingface/transformers and therefore share one ONNX_ENV
        // singleton. Should a version bump ever split them, this would mutate an
        // env the model never reads: no error, no log, just the UI freezing
        // again. Keep the dependency pinned to the version kokoro-js resolves.
        try {
          const { env } = await import('@huggingface/transformers');
          const onnxWasm = env.backends.onnx.wasm;
          if (onnxWasm) {
            // transformers.js defaults this to false on the assumption that
            // callers use WebGPU. On the WASM backend that runs every forward
            // pass synchronously on the main thread, which stalls the session
            // timer and freezes the widget for the length of each utterance.
            // Proxying moves the session into a worker. WebGPU is excluded
            // because proxied sessions reject non-CPU tensor locations.
            if (device === 'wasm') onnxWasm.proxy = true;
            if (options?.wasmPaths) onnxWasm.wasmPaths = options.wasmPaths;
          }
          if (options?.remoteHost) env.remoteHost = options.remoteHost;
        } catch (err) {
          log.warn('failed to configure the transformers environment; synthesis may block the main thread:', err);
        }

        const files = new Map<string, { loaded: number; total: number }>();
        // Track largest file (weights ~99% of download) to avoid premature 100% spikes from small JSON files.
        const progress_callback = (e: any) => {
          if (e?.status !== 'progress' || !e?.total) return;
          files.set(e.file, { loaded: e.loaded, total: e.total });
          let biggest: { loaded: number; total: number } | null = null;
          for (const f of files.values()) {
            if (!biggest || f.total > biggest.total) biggest = f;
          }
          if (biggest) reportProgress(biggest.loaded / biggest.total);
        };

        // No WASM fallback. Retrying on wasm would keep dtype at fp32, running
        // 325MB of full-precision weights on the slowest backend, which is worse
        // than the 86MB q8 default it was meant to beat. Retrying with q8 would
        // mean a second download to reach a configuration that still cannot keep
        // up with speech. Failing to system voices is the honest degradation.
        const tts = await KokoroTTS.from_pretrained(modelId, { dtype, device, progress_callback });

        log.debug(`model ready: ${modelId} | dtype ${dtype} | device ${device}`);
        newEntry.status = 'ready';
        newEntry.subscribers?.clear();
        return tts;
      } catch (err) {
        newEntry.status = 'failed';
        newEntry.subscribers?.clear();
        throw err;
      }
    })();

    newEntry.promise = loadPromise;
    modelCache.set(key, newEntry);

    await loadPromise;
  }

  async init(onProgress?: (loaded: number) => void): Promise<void> {
    this.initPromise ??= this.doInit(onProgress);
    return this.initPromise;
  }

  private async doInit(onProgress?: (loaded: number) => void): Promise<void> {
    try {
      if (KokoroSynthesizer.status(this.options) === 'failed') {
        this.isReady = false;
        return;
      }
      await KokoroSynthesizer.preload(this.options, onProgress);
      const key = getCacheKey(this.options);
      const entry = modelCache.get(key);
      if (entry?.status === 'ready' && entry.promise) {
        this.ttsInstance = await entry.promise;
      } else {
        return;
      }

      onProgress?.(-1);

      const AudioCtx = typeof window !== 'undefined'
        ? (window.AudioContext || (window as any).webkitAudioContext)
        : (globalThis as any).AudioContext;
      if (!AudioCtx) {
        log.warn('AudioContext unavailable, Kokoro cannot play audio');
        this.isReady = false;
        return;
      }

      const ctx = new AudioCtx();
      const gain = ctx.createGain();
      gain.gain.value = this.volume;
      if (typeof ctx.createAnalyser === 'function') {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.connect(gain);
        this.analyser = analyser;
      }
      gain.connect(ctx.destination);
      if (ctx.state === 'suspended') {
        await Promise.resolve(ctx.resume()).catch(() => {});
      }
      this.audioCtx = ctx;
      this.gainNode = gain;

      // Warmup inference graph
      if (this.ttsInstance) {
        await Promise.resolve(this.ttsInstance.generate('Hi.', { voice: this.currentVoice, speed: 1.0 })).catch(() => {});
      }

      this.isReady = true;
    } catch (err) {
      log.warn('Failed to load Kokoro TTS model:', err);
      this.isReady = false;
    }
  }

  supportsLang(lang: SupportedLang): boolean {
    if (lang === 'auto') return true;
    return lang === 'en' || lang.startsWith('en-');
  }

  enqueue(text: string, lang: SupportedLang, opts?: SpeechSynthesizerOptions): Promise<void> {
    return new Promise((resolve) => {
      // First utterance of a fresh run. This is the only latency the listener
      // actually waits on; everything after it is hidden behind playback.
      if (this.queue.length === 0 && !this.isPlaying) {
        this.batchStartedAt = performance.now();
      }
      const job: QueueJob = {
        text,
        voice: this.currentVoice,
        speed: this.speed,
        onStart: opts?.onStart,
        resolve,
        generation: this.currentGeneration,
        state: 'pending',
      };
      this.queue.push(job);
      void this.pump();
    });
  }

  cancel(): void {
    this.currentGeneration++;
    if (this.currentSource) {
      try {
        this.currentSource.onended = null;
        this.currentSource.stop();
      } catch { /* ignore stop errors */ }
      this.currentSource = null;
    }

    for (const job of this.queue) {
      job.resolve();
    }
    this.queue = [];
    this.isPlaying = false;
    this.batchStartedAt = 0;
    // isPumping is owned by pump()'s finally. Clearing it here would let a
    // second pump() start alongside one still awaiting generate(), and both
    // would pick up the same job. The in-flight pump drops the stale job on
    // its generation check and goes on to serve whatever is enqueued next.
  }

  getVoices(): VoiceInfo[] {
    return listKokoroVoices(this.options?.voices);
  }

  applyVoiceSettings(settings: VoiceSettings): void {
    if (settings.voiceId) {
      const available = this.getVoices();
      if (available.some((v) => v.id === settings.voiceId)) {
        this.currentVoice = settings.voiceId;
      }
    }
    this.speed = Math.max(0.5, Math.min(2.0, settings.rate));
    this.volume = Math.max(0.0, Math.min(1.0, settings.volume));
    if (this.gainNode) {
      this.gainNode.gain.value = this.volume;
    }
  }

  getVoiceOverrides(): VoiceSettings | null {
    return {
      voiceId: this.currentVoice,
      rate: this.speed,
      pitch: 1.0,
      volume: this.volume,
    };
  }

  getOutputLevel(): number {
    if (!this.isPlaying || !this.analyser) return 0;
    return rmsToLevel(analyserRms(this.analyser, this.scratch));
  }

  destroy(): void {
    this.cancel();
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    this.gainNode = null;
    this.analyser = null;
    this.scratch = {};
  }

  private async pump(): Promise<void> {
    if (this.isPumping) return;
    this.isPumping = true;

    try {
      while (true) {
        const readyCount = this.queue.filter((j) => j.state === 'ready').length;
        if (this.lookahead - readyCount <= 0) break;

        const next = this.queue.find((j) => j.state === 'pending');
        if (!next) break;

        if (!this.ttsInstance || next.generation !== this.currentGeneration) {
          next.state = 'failed';
          continue;
        }

        try {
          const startedAt = performance.now();
          const audio = await this.ttsInstance.generate(next.text, {
            voice: next.voice,
            speed: next.speed,
          });
          logSynthesisTiming(next.text, audio, performance.now() - startedAt);
          if (next.generation === this.currentGeneration) {
            next.audio = audio;
            next.state = 'ready';
            // Start playing the moment the head is ready. Deferring this to
            // after the loop would hold finished audio silent until the whole
            // lookahead buffer filled, which is the point of generating ahead
            // in the first place: the queue is meant to stay ahead of the
            // speaker, not to be assembled before the speaker begins.
            this.drainAndPlay();
          } else {
            next.state = 'failed';
          }
        } catch (err) {
          log.warn('synthesis failed, dropping utterance:', err);
          next.state = 'failed';
        }
      }

      this.drainAndPlay();
    } finally {
      this.isPumping = false;
    }
  }

  private drainAndPlay(): void {
    if (this.isPlaying) return;
    while (this.queue.length > 0 && this.queue[0].state === 'failed') {
      this.queue.shift()!.resolve();
    }
    const head = this.queue[0];
    if (head && head.state === 'ready' && head.generation === this.currentGeneration) {
      this.isPlaying = true;
      this.playJob(head);
    }
    if (this.queue.some((j) => j.state === 'pending')) {
      void this.pump();
    }
  }

  private playJob(job: QueueJob): void {
    if (!this.audioCtx || !this.gainNode) {
      job.resolve();
      this.queue.shift();
      this.isPlaying = false;
      void this.pump();
      return;
    }

    try {
      const { data: audioData, sampleRate } = readRawAudio(job.audio);

      const buffer = this.audioCtx.createBuffer(1, audioData.length, sampleRate);
      buffer.copyToChannel(audioData, 0);

      const src = this.audioCtx.createBufferSource();
      src.buffer = buffer;
      src.connect(this.analyser ?? this.gainNode);

      this.currentSource = src;

      src.onended = () => {
        if (this.currentSource === src) {
          this.currentSource = null;
        }
        job.resolve();
        this.queue.shift();
        this.isPlaying = false;
        this.drainAndPlay();
      };

      if (this.batchStartedAt) {
        log.debug(`time to first audio: ${Math.round(performance.now() - this.batchStartedAt)}ms`);
        this.batchStartedAt = 0;
      }

      const durationMs = Math.round((audioData.length / sampleRate) * 1000);
      src.start();
      // Audio is already playing, so a listener failure must not unwind the queue.
      try {
        job.onStart?.({ durationMs });
      } catch (err) {
        log.warn('onStart listener failed:', err);
      }
    } catch (err) {
      log.warn('Playback error:', err);
      job.resolve();
      this.queue.shift();
      this.isPlaying = false;
      this.drainAndPlay();
    }
  }
}
