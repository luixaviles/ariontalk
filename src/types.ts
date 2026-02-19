export type WidgetStatus = 'idle' | 'loading' | 'listening' | 'thinking' | 'speaking' | 'error';

export type SupportedLang = 'en' | 'es';

export interface ImageContext {
  blob: Blob;
  alt: string;
  src: string;
}

export interface VoiceSettings {
  voice: SpeechSynthesisVoice | null; // null = automatic selection
  rate: number;   // 0.5–2.0, default 1.0
  pitch: number;  // 0.0–2.0, default 1.0
  volume: number; // 0.0–1.0, default 1.0
}

export interface VoiceSessionState {
  status: WidgetStatus;
  currentLang: SupportedLang;
  elapsedSeconds: number;
  interimTranscript: string;
  error: string | null;
  downloadProgress: number;
}
