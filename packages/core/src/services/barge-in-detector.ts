const RMS_THRESHOLD = 0.035;
const MIN_DURATION_MS = 250;
const FFT_SIZE = 512;

/**
 * Detects user speech during TTS playback using Web Audio API volume monitoring.
 * Uses getUserMedia with echoCancellation to filter out speaker output,
 * then monitors RMS energy to detect when the user is actually speaking.
 */
export class BargeInDetector {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private rafId = 0;
  private monitoring = false;
  private speechStartTime = 0;
  private dataArray: Float32Array<ArrayBuffer> | null = null;

  /** Acquire microphone stream and set up audio pipeline. Call once per session. */
  async init(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true },
      });
      this.audioContext = new AudioContext();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = FFT_SIZE;
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.source.connect(this.analyser);
      this.dataArray = new Float32Array(this.analyser.fftSize);
    } catch (err) {
      console.warn('[ariontalk] BargeInDetector: microphone unavailable, barge-in disabled', err);
      this.cleanup();
    }
  }

  /** Start monitoring mic volume. Calls onBargeIn once when sustained speech is detected. */
  startMonitoring(onBargeIn: () => void): void {
    if (!this.analyser || !this.dataArray) return;

    this.monitoring = true;
    this.speechStartTime = 0;

    const check = () => {
      if (!this.monitoring) return;

      this.analyser!.getFloatTimeDomainData(this.dataArray!);
      const rms = this.computeRMS(this.dataArray!);

      if (rms > RMS_THRESHOLD) {
        if (this.speechStartTime === 0) {
          this.speechStartTime = performance.now();
        } else if (performance.now() - this.speechStartTime >= MIN_DURATION_MS) {
          this.monitoring = false;
          onBargeIn();
          return;
        }
      } else {
        this.speechStartTime = 0;
      }

      this.rafId = requestAnimationFrame(check);
    };

    this.rafId = requestAnimationFrame(check);
  }

  /** Stop monitoring without releasing resources. */
  stopMonitoring(): void {
    this.monitoring = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  /** Release all resources. Call when the engine is destroyed. */
  destroy(): void {
    this.stopMonitoring();
    this.cleanup();
  }

  private computeRMS(data: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i];
    }
    return Math.sqrt(sum / data.length);
  }

  private cleanup(): void {
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
    this.source = null;
    this.dataArray = null;
  }
}
