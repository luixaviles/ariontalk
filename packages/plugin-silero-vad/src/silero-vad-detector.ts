import type { BargeInDetector } from '@ariontalk/core';
import { createLogger } from '@ariontalk/core';

const log = createLogger('vad');

export interface SileroVadOptions {
  /**
   * Base path where vad.worklet.bundle.min.js and silero_vad.onnx are served.
   * @default './'
   */
  baseAssetPath?: string;

  /**
   * Base path where onnxruntime-web WASM files are served.
   * @default './'
   */
  onnxWASMBasePath?: string;

  /**
   * Probability threshold for speech detection (0-1).
   * Higher = fewer false positives but slower to trigger.
   * @default 0.7
   */
  positiveSpeechThreshold?: number;

  /**
   * Probability threshold below which speech is considered absent (0-1).
   * Should be lower than positiveSpeechThreshold (Silero recommends ~0.15 less).
   * @default 0.55
   */
  negativeSpeechThreshold?: number;

  /**
   * Minimum sustained speech duration in ms before triggering barge-in.
   * Shorter sounds are discarded as misfires (coughs, thumps, etc.).
   * @default 500
   */
  minSpeechMs?: number;

  /**
   * Grace period in ms after speech drops below negativeSpeechThreshold
   * before considering speech ended. Bridges brief pauses mid-sentence.
   * @default 1400
   */
  redemptionMs?: number;
}

export class SileroVadDetector implements BargeInDetector {
  private vad: any = null;
  private onBargeInCallback: (() => void) | null = null;
  private monitoring = false;
  private options: SileroVadOptions;
  private stream: MediaStream | null = null;

  private static readonly MIC_CONSTRAINTS: MediaStreamConstraints = {
    audio: { channelCount: 1, echoCancellation: true, autoGainControl: true, noiseSuppression: true },
  };

  constructor(options?: SileroVadOptions) {
    this.options = options ?? {};
  }

  async init(): Promise<void> {
    try {
      // Dynamic import — defers the heavy onnxruntime-web + vad-web loading
      // to when the user actually starts a session with Smart VAD enabled.
      const { MicVAD } = await import('@ricky0123/vad-web');

      this.vad = await MicVAD.new({
        startOnLoad: false,
        positiveSpeechThreshold: this.options.positiveSpeechThreshold ?? 0.7,
        negativeSpeechThreshold: this.options.negativeSpeechThreshold ?? 0.55,
        minSpeechMs: this.options.minSpeechMs ?? 500,
        redemptionMs: this.options.redemptionMs ?? 1400,
        // Only pass asset paths when explicitly set — the library defaults to './'
        ...(this.options.baseAssetPath != null && { baseAssetPath: this.options.baseAssetPath }),
        ...(this.options.onnxWASMBasePath != null && { onnxWASMBasePath: this.options.onnxWASMBasePath }),
        getStream: async () => {
          this.stream = await navigator.mediaDevices.getUserMedia(SileroVadDetector.MIC_CONSTRAINTS);
          return this.stream;
        },
        // The library default stops the tracks here, which restarts echo cancellation
        // from scratch on every turn and leaks our own voice into the first frames.
        pauseStream: async () => {},
        resumeStream: async (stream: MediaStream) => stream,
        // Use onSpeechRealStart instead of onSpeechStart — it only fires after
        // sustained speech exceeding minSpeechMs, filtering out transient noises.
        onSpeechRealStart: () => {
          if (this.monitoring && this.onBargeInCallback) {
            this.monitoring = false;
            this.onBargeInCallback();
          }
        },
      });

      // Acquire the mic and load the worklet now, so the first arm is instant and the
      // echo canceller has already converged when our own audio starts playing.
      await this.vad.start();
      await this.vad.pause();
    } catch (err) {
      log.warn('init failed, barge-in disabled', err);
      this.vad?.destroy().catch(() => {});
      this.vad = null;
      this.stream?.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }

  startMonitoring(onBargeIn: () => void): void {
    this.onBargeInCallback = onBargeIn;
    this.monitoring = true;
    this.vad?.start();
  }

  stopMonitoring(): void {
    this.monitoring = false;
    this.onBargeInCallback = null;
    this.vad?.pause();
  }

  destroy(): void {
    this.stopMonitoring();
    this.vad?.destroy().catch(() => {});
    this.vad = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}
