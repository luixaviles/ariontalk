export type SupportedLang = 'en' | 'es';

export interface ImageContext {
  blob: Blob;
  alt: string;
  src: string;
}

export interface VoiceSettings {
  voice: SpeechSynthesisVoice | null;
  rate: number;
  pitch: number;
  volume: number;
}

/** Plugin interface for barge-in (interruption) detection strategies. */
export interface BargeInDetector {
  /** Acquire resources (mic stream, models, etc.). Called once per session. */
  init(): Promise<void>;
  /** Start monitoring. Call onBargeIn once when interruption is detected. */
  startMonitoring(onBargeIn: () => void): void;
  /** Stop monitoring without releasing resources. */
  stopMonitoring(): void;
  /** Release all resources. Called when the engine is destroyed. */
  destroy(): void;
}

export type EngineStatus = 'idle' | 'loading' | 'listening' | 'thinking' | 'speaking' | 'error';

export interface VoiceEngineState {
  status: EngineStatus;
  currentLang: SupportedLang;
  elapsedSeconds: number;
  interimTranscript: string;
  error: string | null;
  downloadProgress: number;
}
