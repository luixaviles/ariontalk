import type {
  VoiceEngineInterface,
  EngineCapabilities,
  VoiceInfo,
  VoiceSettings,
  VoiceEngineState,
  SupportedLang,
  ImageContext,
} from '@ariontalk/core';
import { PageExtractorService, SessionTimer, createLogger } from '@ariontalk/core';
import { GoogleGenAI, type LiveServerMessage, type Session } from '@google/genai';
import { AudioCapture } from './audio/audio-capture.js';
import { AudioPlayback } from './audio/audio-playback.js';
import { TokenManager } from './session/token-manager.js';
import { buildSystemPrompt } from './context/system-prompt.js';

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
      const pageImages = await this.pageExtractor.extractImages();
      const pageTitle = document.title;
      const pageUrl = window.location.href;

      // Fetch ephemeral token (model + voice + audio config locked into the token)
      const model = this.options.model || DEFAULT_MODEL;
      const { token } = await this.tokenManager.fetchToken(model, this.voiceId);
      if (!this.sessionActive) return;

      // Initialize audio playback
      await this.audioPlayback.init();
      await this.audioPlayback.resume();
      if (!this.sessionActive) return;

      // Connect to Gemini Live
      await this.connect(token, lang, pageText, pageImages, pageTitle, pageUrl);
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
      console.log('an error has occurred!!')
      console.error('error', err);
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

  private async connect(
    token: string,
    lang: string,
    pageText: string,
    pageImages: ImageContext[],
    pageTitle: string,
    pageUrl: string,
  ): Promise<void> {
    const ai = new GoogleGenAI({ apiKey: token, apiVersion: 'v1alpha' });

    // Build system instruction with text + images as Part[]
    const systemPromptText = buildSystemPrompt(pageText, lang, pageTitle, pageUrl);
    const systemParts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
      { text: systemPromptText },
    ];

    for (const img of pageImages) {
      try {
        const base64 = await this.blobToBase64(img.blob);
        systemParts.push({ inlineData: { data: base64, mimeType: 'image/jpeg' } });
        if (img.alt) {
          systemParts.push({ text: `[Image: ${img.alt}]` });
        }
      } catch {
        // Skip images that fail to convert
      }
    }

    const model = this.options.model || DEFAULT_MODEL;

    console.log('going to use model: ', model);

    // responseModalities, speechConfig are locked in the ephemeral token
    // systemInstruction is ignored by BidiGenerateContentConstrained (known limitation)
    this.session = await ai.live.connect({
      model,
      config: {
        inputAudioTranscription: {},
        outputAudioTranscription: {},
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
      this.updateState({ interimTranscript: content.inputTranscription.text });
    }

    // Output transcription (model speech)
    if (content?.outputTranscription?.text) {
      this.updateState({ interimTranscript: content.outputTranscription.text });
    }

    // Interruption
    if (content?.interrupted) {
      this.audioPlayback.clear();
      this.updateState({ status: 'listening', interimTranscript: '' });
    }

    // Turn complete
    if (content?.turnComplete) {
      this.audioPlayback.onDrained(() => {
        if (this.sessionActive) {
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
      const { token } = await this.tokenManager.fetchToken(model, this.voiceId);
      if (!this.sessionActive) return;

      const pageText = this.pageExtractor.extractText();
      const pageImages = await this.pageExtractor.extractImages();
      const pageTitle = document.title;
      const pageUrl = window.location.href;

      await this.connect(token, this.state.currentLang, pageText, pageImages, pageTitle, pageUrl);
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
      const { token } = await this.tokenManager.fetchToken(model, this.voiceId);
      if (!this.sessionActive) return;

      const pageText = this.pageExtractor.extractText();
      const pageImages = await this.pageExtractor.extractImages();
      const pageTitle = document.title;
      const pageUrl = window.location.href;

      this.savedSessionHandle = null;
      await this.connect(token, lang, pageText, pageImages, pageTitle, pageUrl);
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

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        // Strip the data URL prefix (data:image/jpeg;base64,)
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}
