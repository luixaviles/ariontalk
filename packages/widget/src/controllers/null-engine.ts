import type {
  VoiceEngineInterface,
  EngineCapabilities,
  VoiceInfo,
  VoiceSettings,
  VoiceEngineState,
} from '@ariontalk/core';

export class NullEngine implements VoiceEngineInterface {
  readonly capabilities: EngineCapabilities = {
    supportedLanguages: ['auto', 'en', 'es', 'ja', 'fr', 'de', 'pt', 'it', 'zh', 'ko', 'hi', 'ar', 'ru'],
    supportsVoiceSelection: false,
    supportsRatePitchVolume: false,
    supportsBargeInPlugins: false,
    supportsTtsPlugins: false,
    alwaysCaptureMic: false,
    supportsOffline: false,
    maxSessionDurationSec: null,
    requiresTokenServer: false,
    supportsInteractiveHighlights: false,
  };

  readonly state: VoiceEngineState = {
    status: 'idle',
    currentLang: 'auto',
    elapsedSeconds: 0,
    interimTranscript: '',
    error: null,
    downloadProgress: 0,
  };

  onStateChange: ((state: VoiceEngineState) => void) | null = null;

  startSession(): Promise<void> {
    return Promise.reject(new Error('Cannot start session on NullEngine; ensureEngine must be called first.'));
  }

  endSession(): void {}
  destroy(): void {}
  switchLanguage(): void {}
  setMuted(): void {}
  applyVoiceSettings(): void {}
  getVoiceOverrides(): VoiceSettings | null {
    return null;
  }
  getVoices(): VoiceInfo[] {
    return [];
  }
}
