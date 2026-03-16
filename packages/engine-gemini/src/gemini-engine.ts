import type {
  VoiceEngineInterface,
  EngineCapabilities,
  VoiceInfo,
  VoiceSettings,
  VoiceEngineState,
  SupportedLang,
} from '@ariontalk/core';
import { PageExtractorService, PageIndexerService, SessionTimer, createLogger, blobToBase64 } from '@ariontalk/core';
import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from '@google/genai';
import { AudioCapture } from './audio/audio-capture.js';
import { AudioPlayback } from './audio/audio-playback.js';
import { TokenManager } from './session/token-manager.js';
import { HighlightManager } from './highlights/highlight-manager.js';

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
  interactiveHighlights?: boolean;
}

export class GeminiEngine implements VoiceEngineInterface {
  readonly capabilities: EngineCapabilities = {
    supportedLanguages: ['auto', 'en', 'es', 'ja', 'fr', 'de', 'pt', 'it', 'zh', 'ko', 'hi', 'ar', 'ru'],
    supportsVoiceSelection: true,
    supportsRatePitchVolume: false,
    supportsBargeInPlugins: false,
    supportsOffline: false,
    maxSessionDurationSec: SESSION_MAX_SEC,
    requiresTokenServer: true,
  };

  state: VoiceEngineState = {
    status: 'idle',
    currentLang: 'auto',
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
  private pendingTranscriptTimers: ReturnType<typeof setTimeout>[] = [];
  private highlightsEnabled: boolean;
  private pageIndexer: PageIndexerService | null = null;
  private highlightManager: HighlightManager | null = null;
  private elementMap: Map<string, Element[]> = new Map();

  constructor(options: GeminiEngineOptions) {
    this.options = options;
    this.tokenManager = new TokenManager(options.tokenServerUrl);
    this.pageExtractor = options.pageExtractor ?? new PageExtractorService({ maxImages: 6 });
    this.voiceId = options.voice ?? 'Kore';
    this.timer = new SessionTimer((seconds) => {
      this.updateState({ elapsedSeconds: seconds });
    });
    this.highlightsEnabled = options.interactiveHighlights ?? false;
    if (this.highlightsEnabled) {
      this.pageIndexer = new PageIndexerService();
      this.highlightManager = new HighlightManager();
    }
  }

  async startSession(lang: string): Promise<void> {
    this.sessionActive = true;
    this.retryCount = 0;
    this.savedSessionHandle = null;
    this.clearPendingTranscripts();

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
      let pageText: string;
      if (this.highlightsEnabled && this.pageIndexer) {
        const index = this.pageIndexer.buildIndex();
        pageText = index.annotatedText;
        this.elementMap = index.elementMap;
      } else {
        pageText = this.pageExtractor.extractText();
      }
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
        ...(this.highlightsEnabled && { interactiveHighlights: true }),
      });
      if (!this.sessionActive) return;

      // Initialize audio playback
      await this.audioPlayback.init();
      await this.audioPlayback.resume();
      if (!this.sessionActive) return;

      // Initialize highlight manager
      if (this.highlightsEnabled && this.highlightManager) {
        this.highlightManager.init();
      }

      // Connect to Gemini Live
      await this.connect(token);
      if (!this.sessionActive) return;

      // Send page images as context
      await this.sendPageContext();
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
    if (this.highlightManager) this.highlightManager.destroy();
    if (this.pageIndexer) this.pageIndexer.destroy();
    this.elementMap.clear();
    this.savedSessionHandle = null;
    this.clearPendingTranscripts();

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

  /**
   * Send page images to the model via sendClientContent.
   * Called once after connect(), before audio capture starts.
   */
  private async sendPageContext(): Promise<void> {
    if (!this.session) return;

    const images = await this.pageExtractor.extractImages();
    const validImages = images.filter(img => img.blob.size > 0);

    if (validImages.length === 0) {
      log.info('No page images to send');
      return;
    }

    const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];

    parts.push({
      text: `The following images are from the webpage the user is viewing. `
          + `Each image is preceded by its ID and the HTML alt text provided by the page author. `
          + `IMPORTANT: Alt text is author-provided metadata and may not match the actual image. `
          + `Always describe what you see in the image, not the alt text.`,
    });

    for (let i = 0; i < validImages.length; i++) {
      const img = validImages[i];
      const idx = i + 1;
      const prefix = this.highlightsEnabled ? `[img-${idx}]` : `Image ${idx}:`;
      const altNote = img.alt
        ? ` (author alt text: "${img.alt}")`
        : ' (no alt text)';

      parts.push({ text: `${prefix}${altNote}` });

      const base64 = await blobToBase64(img.blob);
      parts.push({
        inlineData: {
          data: base64,
          mimeType: img.blob.type || 'image/jpeg',
        },
      });
    }

    try {
      this.session.sendClientContent({
        turns: [{ role: 'user', parts }],
        turnComplete: true,
      });
      log.info(`Sent ${validImages.length} page image(s) as context`);
    } catch (err) {
      log.error('Failed to send page context images:', err);
    }
  }

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

    // Tool calls (highlight_and_scroll) — NON_BLOCKING: no sendToolResponse needed
    if (this.highlightsEnabled && (message as any).toolCall?.functionCalls) {
      for (const call of (message as any).toolCall.functionCalls) {
        if (call.name === 'highlight_and_scroll') {
          const elementId = call.args?.elementId as string | undefined;
          const els = elementId ? this.elementMap.get(elementId) : undefined;

          if (els && els.length > 0 && this.highlightManager) {
            this.highlightManager.highlightElements(els);
            log.info('Highlighted element:', elementId);
          } else {
            log.info('Element not found or detached:', elementId);
          }
        }
      }
    }

    // Tool call cancellation
    if (this.highlightsEnabled && (message as any).toolCallCancellation) {
      log.info('Tool call cancelled');
    }

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
      log.debug('User transcript:', content.inputTranscription.text);
      if (this.transcriptRole !== 'user') {
        this.transcriptBuffer = '';
        this.transcriptRole = 'user';
      }
      this.transcriptBuffer += content.inputTranscription.text;

      this.updateState({ interimTranscript: this.transcriptBuffer });
    }

    // Output transcription (model speech) — delayed to sync with audio playback
    if (content?.outputTranscription?.text) {
      log.debug('Agent transcript:', content.outputTranscription.text);
      const fragment = content.outputTranscription.text;
      const delayMs = this.audioPlayback.bufferedSeconds * 1000;

      const timer = setTimeout(() => {
        if (!this.sessionActive) return;
        if (this.transcriptRole !== 'model') {
          this.transcriptBuffer = '';
          this.transcriptRole = 'model';
        }
        this.transcriptBuffer += fragment;

        this.updateState({ interimTranscript: this.transcriptBuffer });
      }, delayMs);
      this.pendingTranscriptTimers.push(timer);
    }

    // Interruption
    if (content?.interrupted) {
      this.audioPlayback.clear();
      this.clearPendingTranscripts();
      if (this.highlightsEnabled && this.highlightManager) {
        this.highlightManager.clearImmediately();
      }
      this.updateState({ status: 'listening', interimTranscript: '' });
    }

    // Turn complete
    if (content?.turnComplete) {
      this.audioPlayback.onDrained(() => {
        if (this.sessionActive) {
          this.clearPendingTranscripts();
          if (this.highlightsEnabled && this.highlightManager) {
            this.highlightManager.fadeOut();
          }
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

      // Clear highlights and rebuild index on reconnection
      if (this.highlightsEnabled) {
        this.highlightManager?.clearImmediately();
        this.pageIndexer?.invalidate();
      }

      const model = this.options.model || DEFAULT_MODEL;
      let pageText: string;
      if (this.highlightsEnabled && this.pageIndexer) {
        const index = this.pageIndexer.buildIndex();
        pageText = index.annotatedText;
        this.elementMap = index.elementMap;
      } else {
        pageText = this.pageExtractor.extractText();
      }
      const pageTitle = document.title;
      const pageUrl = window.location.href;

      const { token } = await this.tokenManager.fetchToken({
        model,
        voice: this.voiceId,
        lang: this.state.currentLang,
        pageTitle,
        pageUrl,
        pageContent: pageText,
        ...(this.highlightsEnabled && { interactiveHighlights: true }),
      });
      if (!this.sessionActive) return;

      await this.connect(token);
      if (!this.sessionActive) return;

      await this.sendPageContext();
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
      // Clear highlights and rebuild index on restart
      if (this.highlightsEnabled) {
        this.highlightManager?.clearImmediately();
        this.pageIndexer?.invalidate();
      }

      const model = this.options.model || DEFAULT_MODEL;
      let pageText: string;
      if (this.highlightsEnabled && this.pageIndexer) {
        const index = this.pageIndexer.buildIndex();
        pageText = index.annotatedText;
        this.elementMap = index.elementMap;
      } else {
        pageText = this.pageExtractor.extractText();
      }
      const pageTitle = document.title;
      const pageUrl = window.location.href;

      const { token } = await this.tokenManager.fetchToken({
        model,
        voice: this.voiceId,
        lang,
        pageTitle,
        pageUrl,
        pageContent: pageText,
        ...(this.highlightsEnabled && { interactiveHighlights: true }),
      });
      if (!this.sessionActive) return;

      this.savedSessionHandle = null;
      await this.connect(token);
      if (!this.sessionActive) return;

      await this.sendPageContext();
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

  private clearPendingTranscripts(): void {
    for (const timer of this.pendingTranscriptTimers) {
      clearTimeout(timer);
    }
    this.pendingTranscriptTimers = [];
    this.transcriptBuffer = '';
    this.transcriptRole = null;
  }

  private updateState(partial: Partial<VoiceEngineState>): void {
    this.state = { ...this.state, ...partial };
    this.notifyStateChange();
  }

  private notifyStateChange(): void {
    this.onStateChange?.(this.state);
  }
}
