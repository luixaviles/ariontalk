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

function base64ToFloat32(base64: string): Float32Array {
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

export class AudioPlayback {
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private drainedCallback: (() => void) | null = null;
  private _playing = false;

  async init(): Promise<void> {
    this.audioContext = new AudioContext({ sampleRate: 24000 });

    const blob = new Blob([PLAYBACK_WORKLET_CODE], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    await this.audioContext.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    this.workletNode = new AudioWorkletNode(this.audioContext, 'playback-processor');

    this.workletNode.port.onmessage = (event: MessageEvent) => {
      if (event.data.type === 'drained') {
        this._playing = false;
        log.debug('Playback queue drained');
        if (this.drainedCallback) {
          const cb = this.drainedCallback;
          this.drainedCallback = null;
          cb();
        }
      }
    };

    this.workletNode.connect(this.audioContext.destination);
    log.info('Audio playback initialized at 24kHz');
  }

  get playing(): boolean {
    return this._playing;
  }

  enqueue(base64Pcm: string): void {
    if (!this.workletNode) return;
    const samples = base64ToFloat32(base64Pcm);
    this.workletNode.port.postMessage({ type: 'enqueue', samples });
    this._playing = true;
  }

  clear(): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'clear' });
    this._playing = false;
    this.drainedCallback = null;
    log.debug('Playback cleared');
  }

  onDrained(callback: () => void): void {
    if (!this._playing) {
      callback();
      return;
    }
    this.drainedCallback = callback;
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
    this.drainedCallback = null;
    this._playing = false;
    log.info('Audio playback destroyed');
  }
}
