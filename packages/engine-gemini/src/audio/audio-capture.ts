import { createLogger } from '@ariontalk/core';

const log = createLogger('audio-capture');

const CAPTURE_WORKLET_CODE = `
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(320); // 20ms at 16kHz
    this.offset = 0;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;

    let i = 0;
    while (i < input.length) {
      const remaining = this.buffer.length - this.offset;
      const toCopy = Math.min(remaining, input.length - i);
      this.buffer.set(input.subarray(i, i + toCopy), this.offset);
      this.offset += toCopy;
      i += toCopy;

      if (this.offset >= this.buffer.length) {
        this.port.postMessage({ audio: this.buffer.slice() });
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('capture-processor', CaptureProcessor);
`;

function float32ToInt16Base64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export type AudioDataCallback = (base64Pcm: string) => void;

export class AudioCapture {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private onAudioData: AudioDataCallback | null = null;
  private _muted = false;

  async start(onAudioData: AudioDataCallback): Promise<void> {
    this.onAudioData = onAudioData;

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16000,
      },
    });

    this.audioContext = new AudioContext({ sampleRate: 16000 });
    await this.audioContext.resume();

    // Register worklet from inline code via Blob URL
    const blob = new Blob([CAPTURE_WORKLET_CODE], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    await this.audioContext.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
    this.workletNode = new AudioWorkletNode(this.audioContext, 'capture-processor');

    this.workletNode.port.onmessage = (event: MessageEvent) => {
      if (this._muted) return;
      const float32: Float32Array = event.data.audio;
      const base64 = float32ToInt16Base64(float32);
      this.onAudioData?.(base64);
    };

    this.sourceNode.connect(this.workletNode);
    // Do NOT connect workletNode to destination — we only capture, not play
    // back the mic. process() is called as long as sourceNode provides active
    // input to the worklet, so no destination connection is needed.

    log.info('Audio capture started at 16kHz');
  }

  setMuted(muted: boolean): void {
    this._muted = muted;
    log.debug('Capture muted:', muted);
  }

  stop(): void {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.onAudioData = null;
    log.info('Audio capture stopped');
  }

  destroy(): void {
    this.stop();
  }
}
