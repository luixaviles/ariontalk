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

export type BargeInMode = 'off' | 'energy';

export type EngineStatus = 'idle' | 'loading' | 'listening' | 'thinking' | 'speaking' | 'error';

export interface VoiceEngineState {
  status: EngineStatus;
  currentLang: SupportedLang;
  elapsedSeconds: number;
  interimTranscript: string;
  error: string | null;
  downloadProgress: number;
}
