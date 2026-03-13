import type {
  VoiceEngineInterface,
  EngineCapabilities,
  VoiceInfo,
  VoiceSettings,
  VoiceEngineState,
  SupportedLang,
} from '@ariontalk/core';
import { PageExtractorService, SessionTimer, createLogger } from '@ariontalk/core';
import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from '@google/genai';
import { AudioCapture } from './audio/audio-capture.js';
import { AudioPlayback } from './audio/audio-playback.js';
import { TokenManager } from './session/token-manager.js';

const log = createLogger('gemini-engine');

const GEMINI_VOICES: VoiceInfo[] = [
  { id: 'Kore', name: 'Kore', lang: 'en', local: false },
  { id: 'Puck', name: 'Puck', lang: 'en', local: false },
  { id: 'Charon', name: 'Charon', lang: 'en', local: false },
  { id: 'Aoede', name: 'Aoede', lang: 'en', local: false },
  { id: 'Fenrir', name: 'Fenrir', lang: 'en', local: false },
  { id: 'Leda', name: 'Leda', lang: 'en', local: false },
  { id: 'Orus', name: 'Orus', lang: 'en', local: false },
  { id: 'Zephyr', name: 'Zephyr', lang: 'en', local: false },
];

const DEFAULT_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';
const SESSION_MAX_SEC = 15 * 60;
const SESSION_WARNING_SEC = 12 * 60;

export interface GeminiEngineOptions {
  tokenServerUrl: string;
  model?: string;
  voice?: string;
  pageExtractor?: PageExtractorService;
}

export class GeminiEngine implements VoiceEngineInterface {
  readonly capabilities: EngineCapabilities = {
    supportedLanguages: ['en', 'es', 'ja', 'fr', 'de', 'pt', 'it', 'zh', 'ko', 'hi', 'ar', 'ru'],
    supportsVoiceSelection: true,
    supportsRatePitchVolume: false,
    supportsBargeInPlugins: false,
    supportsOffline: false,
    maxSessionDurationSec: SESSION_MAX_SEC,
    requiresTokenServer: true,
  };

  state: VoiceEngineState = {
    status: 'idle',
    currentLang: 'en',
    elapsedSeconds: 0,
    interimTranscript: '',
    error: null,
    downloadProgress: 0,
  };

  onStateChange: ((state: VoiceEngineState) => void) | null = null;

  private options: GeminiEngineOptions;
  private tokenManager: TokenManager;
  private audioCapture = new AudioCapture();
  private audioPlayback = new AudioPlayback();
  private pageExtractor: PageExtractorService;
  private timer: SessionTimer;
  private session: Session | null = null;
  private sessionActive = false;
  private voiceId: string;
  private savedSessionHandle: string | null = null;
  private sessionWarningTimeout: ReturnType<typeof setTimeout> | null = null;
  private sessionEndTimeout: ReturnType<typeof setTimeout> | null = null;
  private retryCount = 0;
  private static readonly MAX_RETRIES = 3;
  private transcriptBuffer = '';
  private transcriptRole: 'user' | 'model' | null = null;

  constructor(options: GeminiEngineOptions) {
    this.options = options;
    this.tokenManager = new TokenManager(options.tokenServerUrl);
    this.pageExtractor = options.pageExtractor ?? new PageExtractorService();
    this.voiceId = options.voice ?? 'Kore';
    this.timer = new SessionTimer((seconds) => {
      this.updateState({ elapsedSeconds: seconds });
    });
  }

  async startSession(lang: string): Promise<void> {
    this.sessionActive = true;
    this.retryCount = 0;
    this.savedSessionHandle = null;
    this.transcriptBuffer = '';
    this.transcriptRole = null;

    this.state = {
      status: 'loading',
      currentLang: lang as SupportedLang,
      elapsedSeconds: 0,
      interimTranscript: '',
      error: null,
      downloadProgress: 0,
    };
    this.notifyStateChange();

    try {
      // Extract page context
      const pageText = this.pageExtractor.extractText();
      const pageTitle = document.title;
      const pageUrl = window.location.href;

      // Fetch ephemeral token with page context (system instruction baked into token)
      const model = this.options.model || DEFAULT_MODEL;
      const { token } = await this.tokenManager.fetchToken({
        model,
        voice: this.voiceId,
        lang,
        pageTitle,
        pageUrl,
        pageContent: pageText,
      });
      if (!this.sessionActive) return;

      // Initialize audio playback
      await this.audioPlayback.init();
      await this.audioPlayback.resume();
      if (!this.sessionActive) return;

      // Connect to Gemini Live
      await this.connect(token);
      if (!this.sessionActive) return;

      // Start mic capture
      await this.audioCapture.start((base64Pcm) => {
        if (this.session && this.sessionActive) {
          try {
            this.session.sendRealtimeInput({ audio: { data: base64Pcm, mimeType: 'audio/pcm;rate=16000' } });
          } catch {
            // WebSocket may be closing — ignore
          }
        }
      });

      // Start timer
      this.timer.start();
      this.startSessionTimers();

      this.updateState({ status: 'listening' });
      log.info('Session started, lang:', lang);
    } catch (err) {
      if (!this.sessionActive) return;
      const message = err instanceof Error ? err.message : 'Failed to start session';
      log.error('startSession failed:', message);
      this.updateState({ status: 'error', error: message });
    }
  }

  endSession(): void {
    this.sessionActive = false;
    this.clearSessionTimers();
    this.timer.reset();
    this.audioCapture.stop();
    this.audioPlayback.destroy();

    if (this.session) {
      try { this.session.close(); } catch { /* ignore */ }
      this.session = null;
    }

    this.pageExtractor.destroy();
    this.savedSessionHandle = null;

    this.state = {
      status: 'idle',
      currentLang: this.state.currentLang,
      elapsedSeconds: 0,
      interimTranscript: '',
      error: null,
      downloadProgress: 0,
    };
    this.notifyStateChange();
    log.info('Session ended');
  }

  destroy(): void {
    this.endSession();
  }

  switchLanguage(lang: string): void {
    if (!this.sessionActive) return;
    log.info('Switching language to', lang);

    // Close current session and reconnect with new language
    this.audioCapture.stop();
    if (this.session) {
      try { this.session.close(); } catch { /* ignore */ }
      this.session = null;
    }

    this.updateState({ currentLang: lang as SupportedLang, status: 'loading' });

    // Re-start session with new language
    this.restartSession(lang);
  }

  setMuted(muted: boolean): void {
    this.audioCapture.setMuted(muted);
  }

  applyVoiceSettings(settings: VoiceSettings): void {
    if (settings.voiceId) {
      this.voiceId = settings.voiceId;
    }
  }

  getVoiceOverrides(): VoiceSettings | null {
    return {
      voiceId: this.voiceId,
      rate: 1,
      pitch: 1,
      volume: 1,
    };
  }

  getVoices(): VoiceInfo[] {
    return GEMINI_VOICES;
  }

  // --- Private methods ---

  private async connect(token: string): Promise<void> {
    const ai = new GoogleGenAI({ apiKey: token, apiVersion: 'v1alpha' });
    const model = this.options.model || DEFAULT_MODEL;

    
    this.session = await ai.live.connect({
      model,
      config: {
        responseModalities: [Modality.AUDIO],
        sessionResumption: this.savedSessionHandle
          ? { handle: this.savedSessionHandle }
          : {},
      },
      callbacks: {
        onopen: () => {
          log.info('WebSocket connected');
          this.retryCount = 0;
        },
        onmessage: (message: LiveServerMessage) => {
          this.handleMessage(message);
        },
        onerror: (error: ErrorEvent) => {
          log.error('WebSocket error:', error.message);
          this.handleDisconnect();
        },
        onclose: (event: CloseEvent) => {
          log.info('WebSocket closed:', event.code, event.reason);
          if (this.sessionActive) {
            this.handleDisconnect();
          }
        },
      },
    });
  }

  private handleMessage(message: LiveServerMessage): void {
    const content = message.serverContent;

    // Audio data -> playback
    if (content?.modelTurn?.parts) {
      for (const part of content.modelTurn.parts) {
        if (part.inlineData?.data) {
          this.audioPlayback.enqueue(part.inlineData.data);
          if (this.state.status !== 'speaking') {
            this.updateState({ status: 'speaking' });
          }
        }
      }
    }

    // Input transcription (user speech)
    if (content?.inputTranscription?.text) {
      if (this.transcriptRole !== 'user') {
        this.transcriptBuffer = '';
        this.transcriptRole = 'user';
      }
      this.transcriptBuffer += content.inputTranscription.text;
      this.updateState({ interimTranscript: this.transcriptBuffer });
    }

    // Output transcription (model speech)
    if (content?.outputTranscription?.text) {
      if (this.transcriptRole !== 'model') {
        this.transcriptBuffer = '';
        this.transcriptRole = 'model';
      }
      this.transcriptBuffer += content.outputTranscription.text;
      this.updateState({ interimTranscript: this.transcriptBuffer });
    }

    // Interruption
    if (content?.interrupted) {
      this.audioPlayback.clear();
      this.transcriptBuffer = '';
      this.transcriptRole = null;
      this.updateState({ status: 'listening', interimTranscript: '' });
    }

    // Turn complete
    if (content?.turnComplete) {
      this.audioPlayback.onDrained(() => {
        if (this.sessionActive) {
          this.transcriptBuffer = '';
          this.transcriptRole = null;
          this.updateState({ status: 'listening', interimTranscript: '' });
        }
      });
    }

    // Session resumption
    if (message.sessionResumptionUpdate?.resumable && message.sessionResumptionUpdate?.newHandle) {
      this.savedSessionHandle = message.sessionResumptionUpdate.newHandle;
    }

    // GoAway -- server requesting disconnect
    if (message.goAway) {
      log.info('Received goAway, reconnecting...');
      this.audioCapture.stop();
      this.reconnectWithResumption();
    }
  }

  private async handleDisconnect(): Promise<void> {
    if (!this.sessionActive) return;

    // Stop audio capture immediately to prevent send-on-closed-socket spam
    this.audioCapture.stop();

    if (this.retryCount >= GeminiEngine.MAX_RETRIES) {
      this.updateState({ status: 'error', error: 'Connection lost' });
      return;
    }

    this.retryCount++;
    const delay = Math.pow(2, this.retryCount) * 1000;
    log.info(`Reconnecting in ${delay}ms (attempt ${this.retryCount}/${GeminiEngine.MAX_RETRIES})`);

    await new Promise(resolve => setTimeout(resolve, delay));
    if (!this.sessionActive) return;

    await this.reconnectWithResumption();
  }

  private async reconnectWithResumption(): Promise<void> {
    if (!this.sessionActive) return;

    try {
      if (this.session) {
        try { this.session.close(); } catch { /* ignore */ }
        this.session = null;
      }

      const model = this.options.model || DEFAULT_MODEL;
      const pageText = this.pageExtractor.extractText();
      const pageTitle = document.title;
      const pageUrl = window.location.href;

      const { token } = await this.tokenManager.fetchToken({
        model,
        voice: this.voiceId,
        lang: this.state.currentLang,
        pageTitle,
        pageUrl,
        pageContent: pageText,
      });
      if (!this.sessionActive) return;

      await this.connect(token);
      if (!this.sessionActive) return;

      // Restart audio capture after successful reconnect
      await this.audioCapture.start((base64Pcm) => {
        if (this.session && this.sessionActive) {
          try {
            this.session.sendRealtimeInput({ audio: { data: base64Pcm, mimeType: 'audio/pcm;rate=16000' } });
          } catch {
            // WebSocket may be closing — ignore
          }
        }
      });

      log.info('Reconnected with session resumption');
    } catch (err) {
      log.error('Reconnection failed:', err);
      if (this.sessionActive) {
        this.handleDisconnect();
      }
    }
  }

  private async restartSession(lang: string): Promise<void> {
    try {
      const model = this.options.model || DEFAULT_MODEL;
      const pageText = this.pageExtractor.extractText();
      const pageTitle = document.title;
      const pageUrl = window.location.href;

      const { token } = await this.tokenManager.fetchToken({
        model,
        voice: this.voiceId,
        lang,
        pageTitle,
        pageUrl,
        pageContent: pageText,
      });
      if (!this.sessionActive) return;

      this.savedSessionHandle = null;
      await this.connect(token);
      if (!this.sessionActive) return;

      await this.audioCapture.start((base64Pcm) => {
        if (this.session && this.sessionActive) {
          try {
            this.session.sendRealtimeInput({ audio: { data: base64Pcm, mimeType: 'audio/pcm;rate=16000' } });
          } catch {
            // WebSocket may be closing — ignore
          }
        }
      });

      this.updateState({ status: 'listening' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to switch language';
      this.updateState({ status: 'error', error: message });
    }
  }

  private startSessionTimers(): void {
    this.sessionWarningTimeout = setTimeout(() => {
      this.updateState({ error: 'Session ending in 3 minutes' });
      setTimeout(() => {
        if (this.state.error === 'Session ending in 3 minutes') {
          this.updateState({ error: null });
        }
      }, 5000);
    }, SESSION_WARNING_SEC * 1000);

    this.sessionEndTimeout = setTimeout(() => {
      this.endSession();
    }, SESSION_MAX_SEC * 1000);
  }

  private clearSessionTimers(): void {
    if (this.sessionWarningTimeout) {
      clearTimeout(this.sessionWarningTimeout);
      this.sessionWarningTimeout = null;
    }
    if (this.sessionEndTimeout) {
      clearTimeout(this.sessionEndTimeout);
      this.sessionEndTimeout = null;
    }
  }

  private updateState(partial: Partial<VoiceEngineState>): void {
    this.state = { ...this.state, ...partial };
    this.notifyStateChange();
  }

  private notifyStateChange(): void {
    this.onStateChange?.(this.state);
  }
}
