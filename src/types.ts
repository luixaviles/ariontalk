export type WidgetStatus = 'idle' | 'loading' | 'listening' | 'thinking' | 'speaking' | 'error';

export type SupportedLang = 'en' | 'es';

export interface ImageContext {
  blob: Blob;
  alt: string;
  src: string;
}

export interface VoiceSessionState {
  status: WidgetStatus;
  currentLang: SupportedLang;
  elapsedSeconds: number;
  interimTranscript: string;
  error: string | null;
  downloadProgress: number;
}
