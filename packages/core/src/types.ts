export type WellKnownLang = 'auto' | 'en' | 'es' | 'ja' | 'fr' | 'de' | 'pt'
                         | 'it' | 'zh' | 'ko' | 'hi' | 'ar' | 'ru';
export type SupportedLang = WellKnownLang | (string & {});

export interface ImageContext {
  blob: Blob;
  alt: string;
  src: string;
}

export interface VoiceInfo {
  id: string;           // Unique identifier (voiceURI for local, name for Gemini)
  name: string;         // Display name
  lang: string;         // BCP-47 language code
  local: boolean;       // True for on-device voices
}

export interface VoiceSettings {
  voiceId: string | null;
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

export interface EngineCapabilities {
  supportedLanguages: readonly string[];
  supportsVoiceSelection: boolean;
  supportsRatePitchVolume: boolean;
  supportsBargeInPlugins: boolean;
  supportsOffline: boolean;
  maxSessionDurationSec: number | null;   // null = unlimited
  requiresTokenServer: boolean;
}

export interface VoiceEngineInterface {
  // Lifecycle
  startSession(lang: string): Promise<void>;
  endSession(): void;
  destroy(): void;

  // Runtime
  switchLanguage(lang: string): void;
  setMuted(muted: boolean): void;

  // Voice settings
  applyVoiceSettings(settings: VoiceSettings): void;
  getVoiceOverrides(): VoiceSettings | null;
  getVoices(): VoiceInfo[];

  // State
  readonly state: VoiceEngineState;
  onStateChange: ((state: VoiceEngineState) => void) | null;

  // Capabilities (engines declare what they support)
  readonly capabilities: EngineCapabilities;
}
