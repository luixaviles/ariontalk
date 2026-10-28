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
  /** Optional optgroup label. Falls back to heuristic tiering when absent. */
  group?: string;
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

/** Timing a backend can report when playback of one utterance begins. */
export interface SpeechSynthesizerStartMeta {
  /** Playback duration in ms at the current rate, when known before playback starts. */
  durationMs?: number;
}

export interface SpeechSynthesizerOptions {
  /** Playback began. Called at most once, and never for canceled or failed utterances. */
  onStart?: (meta?: SpeechSynthesizerStartMeta) => void;
  /** Playback reached the word starting at charIndex in the exact text passed to enqueue(). */
  onBoundary?: (charIndex: number) => void;
}

/** Plugin interface for text-to-speech backends. */
export interface SpeechSynthesizer {
  /** Stable identifier, matching the TtsPlugin descriptor's id. */
  readonly id: string;
  /** False until init() has finished loading models. Callers route elsewhere while false. */
  readonly isReady: boolean;

  /**
   * Load models and acquire audio resources. Awaited before the opening utterance
   * when this backend will speak it.
   */
  init(onProgress?: (loaded: number) => void): Promise<void>;
  /** Whether this backend can speak the given language. */
  supportsLang(lang: SupportedLang): boolean;
  /** Queue one utterance. Resolves when it finishes playing, or immediately if canceled. */
  enqueue(text: string, lang: SupportedLang, opts?: SpeechSynthesizerOptions): Promise<void>;
  /** Stop playback now, drop the queue, and resolve every pending promise. */
  cancel(): void;
  /** Voices this backend offers. */
  getVoices(): VoiceInfo[];
  applyVoiceSettings(settings: VoiceSettings): void;
  getVoiceOverrides(): VoiceSettings | null;
  /** Optional. Current playback level from 0 to 1, or null when the backend cannot measure it. */
  getOutputLevel?(): number | null;
  /** Release all resources. */
  destroy(): void;
}

export type EngineStatus = 'idle' | 'loading' | 'listening' | 'thinking' | 'speaking' | 'error';

export type EngineErrorCode =
  | 'mic-blocked' | 'mic-not-found'
  | 'speech-unavailable' | 'speech-stopped'
  | 'model-unavailable' | 'model-memory'
  | 'answer-failed' | 'language-switch-failed';

export interface VoiceEngineState {
  status: EngineStatus;
  currentLang: SupportedLang;
  elapsedSeconds: number;
  interimTranscript: string;
  error: string | null;
  downloadProgress: number;
  /** What the current 'loading' status is waiting on. Absent means 'connecting'. */
  loadingStage?: 'connecting' | 'voice' | 'ai';
  /** Machine-readable cause of `error`. Absent when the engine doesn't classify. */
  errorCode?: EngineErrorCode;
  /** True while the visitor's speech is detected during 'listening'. */
  userSpeaking?: boolean;
  /** True when recognition, the model and the active voice all run on this device. Absent means unknown. */
  onDevice?: boolean;
}

export interface EngineCapabilities {
  supportedLanguages: readonly string[];
  supportsVoiceSelection: boolean;
  supportsRatePitchVolume: boolean;
  supportsBargeInPlugins: boolean;
  /** Whether the engine can host third-party TTS backends. */
  supportsTtsPlugins?: boolean;
  alwaysCaptureMic: boolean;
  supportsOffline: boolean;
  maxSessionDurationSec: number | null;   // null = unlimited
  requiresTokenServer: boolean;
  /** Whether the engine can scroll to and highlight page sections while speaking. */
  supportsInteractiveHighlights?: boolean;
}

export interface VoiceEngineInterface {
  // Lifecycle
  startSession(lang: string, options?: { greetingLang?: string; initialElapsedSeconds?: number }): Promise<void>;
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

  /** Optional. Levels from 0 to 1, polled by the UI. `output` is null when playback can't be measured. */
  getAudioLevels?(): { input: number; output: number | null };
}
