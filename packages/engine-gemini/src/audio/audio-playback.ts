import { createLogger } from '@ariontalk/core';

const log = createLogger('audio-playback');

const PLAYBACK_WORKLET_CODE = `
class PlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.currentBuffer = null;
    this.currentOffset = 0;
    this.playing = false;

    this.port.onmessage = (event) => {
      if (event.data.type === 'enqueue') {
        this.queue.push(event.data.samples);
        this.playing = true;
      } else if (event.data.type === 'clear') {
        this.queue = [];
        this.currentBuffer = null;
        this.currentOffset = 0;
        this.playing = false;
      }
    };
  }

  process(inputs, outputs) {
    const output = outputs[0][0];
    if (!output) return true;

    let outputOffset = 0;

    while (outputOffset < output.length) {
      if (!this.currentBuffer) {
        if (this.queue.length === 0) {
          // Fill remaining with silence
          output.fill(0, outputOffset);
          if (this.playing) {
            this.playing = false;
            this.port.postMessage({ type: 'drained' });
          }
          return true;
        }
        this.currentBuffer = this.queue.shift();
        this.currentOffset = 0;
      }

      const remaining = this.currentBuffer.length - this.currentOffset;
      const toCopy = Math.min(remaining, output.length - outputOffset);

      for (let i = 0; i < toCopy; i++) {
        output[outputOffset + i] = this.currentBuffer[this.currentOffset + i];
      }

      this.currentOffset += toCopy;
      outputOffset += toCopy;

      if (this.currentOffset >= this.currentBuffer.length) {
        this.currentBuffer = null;
      }
    }

    return true;
  }
}
registerProcessor('playback-processor', PlaybackProcessor);
`;

export function base64ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 0x8000;
  }
  return float32;
}

const SAMPLE_RATE = 24000;

export class AudioPlayback {
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private drainedCallbacks: Set<() => void> = new Set();
  private drainTimers: Set<ReturnType<typeof setTimeout>> = new Set();
  /**
   * _playing is the authoritative worklet state (via the drained message);
   * bufferedSeconds is a drifting estimate. Both are reset by handleDrained/clear/destroy.
   */
  private _playing = false;
  private _playbackEndTime = 0;

  async init(): Promise<void> {
    this.audioContext = new AudioContext({ sampleRate: 24000 });

    const blob = new Blob([PLAYBACK_WORKLET_CODE], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    await this.audioContext.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    this.workletNode = new AudioWorkletNode(this.audioContext, 'playback-processor');

    this.workletNode.port.onmessage = (event: MessageEvent) => {
      if (event.data.type === 'drained') this.handleDrained();
    };

    this.workletNode.connect(this.audioContext.destination);
    log.info('Audio playback initialized at 24kHz');
  }

  /** Dispatches all registered drained callbacks. Called by the worklet
   *  'drained' message; also the single place drain state is reset. */
  private handleDrained(): void {
    this._playing = false;
    this._playbackEndTime = 0;
    log.debug('Playback queue drained');
    const callbacks = Array.from(this.drainedCallbacks);
    this.drainedCallbacks.clear();
    for (const cb of callbacks) {
      try {
        cb();
      } catch (err) {
        log.error('Error in drained callback:', err);
      }
    }
  }

  get playing(): boolean {
    return this._playing;
  }

  get bufferedSeconds(): number {
    return Math.max(0, this._playbackEndTime - performance.now() / 1000);
  }

  /** Returns the duration of the enqueued audio in seconds, or 0 if dropped. */
  enqueue(base64Pcm: string): number {
    if (!this.workletNode) return 0;
    const samples = base64ToFloat32(base64Pcm);
    const duration = samples.length / SAMPLE_RATE;
    const now = performance.now() / 1000;
    this._playbackEndTime = Math.max(now, this._playbackEndTime) + duration;
    this.workletNode.port.postMessage({ type: 'enqueue', samples });
    this._playing = true;
    return duration;
  }

  clear(): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'clear' });
    this._playing = false;
    this._playbackEndTime = 0;
    for (const t of this.drainTimers) clearTimeout(t);
    this.drainTimers.clear();
    this.drainedCallbacks.clear();
    log.debug('Playback cleared');
  }

  /**
   * Run `callback` when playback drains. If `timeoutMs` is given, it is a
   * bounded wait: the callback fires on the real drain OR after `timeoutMs`
   * if the drain is never delivered (suspended context, backgrounded tab,
   * underrun) — whichever comes first, exactly once. Without `timeoutMs`,
   * it waits indefinitely for the drain.
   */
  onDrained(callback: () => void, timeoutMs?: number): void {
    if (!this._playing) {
      callback();
      return;
    }
    if (timeoutMs === undefined) {
      this.drainedCallbacks.add(callback);
      return;
    }
    let fired = false;
    const run = () => {
      if (fired) return;
      fired = true;
      clearTimeout(timer);
      this.drainTimers.delete(timer);
      this.drainedCallbacks.delete(run);
      callback();
    };
    const timer = setTimeout(run, timeoutMs);
    this.drainTimers.add(timer);
    this.drainedCallbacks.add(run);
  }

  async resume(): Promise<void> {
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  destroy(): void {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    for (const t of this.drainTimers) clearTimeout(t);
    this.drainTimers.clear();
    this.drainedCallbacks.clear();
    this._playing = false;
    log.info('Audio playback destroyed');
  }
}
