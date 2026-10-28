import { analyserRms, createLogger, micErrorKind, rmsToLevel, type AnalyserScratch } from '@ariontalk/core';

const log = createLogger('input-level-meter');

const FFT_SIZE = 256;

const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true },
};

function resolveAudioContextCtor(): typeof AudioContext | null {
  if (typeof window !== 'undefined') {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) return Ctor;
  }
  return (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext ?? null;
}

/**
 * Samples microphone input level using Web Audio API AnalyserNode.
 * Pauses sampling while thinking, and releases the stream on mute, session end,
 * or terminal error (re-acquiring when unmuted).
 */
export class InputLevelMeter {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private scratch: AnalyserScratch = {};
  private acquirePromise: Promise<void> | null = null;
  private paused = true;
  private generation = 0;

  onError: ((errorName: 'NotAllowedError' | 'NotFoundError') => void) | null = null;

  get level(): number {
    if (this.paused || !this.analyser) {
      return 0;
    }
    return rmsToLevel(analyserRms(this.analyser, this.scratch));
  }

  resume(): void {
    this.paused = false;
    if (this.audioContext?.state === 'suspended' && typeof this.audioContext.resume === 'function') {
      void Promise.resolve(this.audioContext.resume()).catch(() => {});
    }
    if (!this.stream && !this.acquirePromise) {
      this.acquirePromise = this.acquire();
    }
  }

  pause(): void {
    this.paused = true;
  }

  release(): void {
    this.generation++;
    this.paused = true;
    this.acquirePromise = null;

    if (this.source) {
      try { this.source.disconnect?.(); } catch { /* ignore */ }
      this.source = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
    this.analyser = null;
    this.scratch = {};
  }

  stop(): void {
    this.release();
  }

  destroy(): void {
    this.stop();
  }

  private async acquire(): Promise<void> {
    if (typeof navigator === 'undefined' || typeof navigator.mediaDevices?.getUserMedia !== 'function') {
      return;
    }

    const gen = this.generation;
    try {
      const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
      if (gen !== this.generation) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        return;
      }

      this.stream = stream;

      const AudioCtx = resolveAudioContextCtor();
      if (!AudioCtx) {
        return;
      }

      const ctx = new AudioCtx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      this.audioContext = ctx;
      this.analyser = analyser;
      this.source = source;

      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        await Promise.resolve(ctx.resume()).catch(() => {});
      }
    } catch (err) {
      this.acquirePromise = null;
      if (gen !== this.generation) return;

      const kind = micErrorKind(err);
      if (kind === 'blocked') {
        this.onError?.('NotAllowedError');
      } else if (kind === 'not-found') {
        this.onError?.('NotFoundError');
      } else {
        log.warn('microphone unavailable, level meter disabled', err);
      }
    }
  }
}
