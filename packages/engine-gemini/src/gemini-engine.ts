import type {
  VoiceEngineInterface,
  EngineCapabilities,
  VoiceInfo,
  VoiceSettings,
  VoiceEngineState,
  SupportedLang,
} from '@ariontalk/core';
import { PageExtractorService, PageIndexerService, SessionTimer, HighlightManager, createLogger, blobToBase64 } from '@ariontalk/core';
import {
  WsClient,
  WsHandshakeError,
  buildLiveUrl,
  buildSetupFrame,
  isSetupComplete,
  encodeAudioChunk,
  encodeText,
  encodeClientContent,
  encodeToolResponse,
  type FunctionResponse,
  type LiveServerMessage,
  type ToolCall,
  type EnginePart,
} from '@ariontalk/engine-cloud-ws';
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

const DEFAULT_MODEL = 'gemini-3.8-live';
const SESSION_MAX_SEC = 15 * 60;
const SESSION_WARNING_SEC = 12 * 60;
const END_SESSION_DRAIN_TIMEOUT_MS = 10000;
const DRAIN_FALLBACK_MARGIN_MS = 3000;

export interface SessionEndDetail {
  duration: number;
  reason: 'user' | 'timeout' | 'error' | 'destroy' | 'agent';
  sessionMeta?: Record<string, unknown>;
}

/**
 * Context passed to `onUnknownToolCall` so wrappers can coordinate with
 * engine-internal state. Lets a tool handler defer side effects that would
 * tear down the AudioContext (e.g. page navigation) until the agent's
 * last buffered words have played out.
 */
export interface ToolCallContext {
  /**
   * Resolves when the audio playback queue is empty, or after `timeoutMs`
   * (default 5000), whichever comes first.
   */
  awaitAudioDrain(timeoutMs?: number): Promise<void>;
}

export interface GeminiEngineOptions {
  tokenServerUrl: string;
  tokenRequestExtras?: Record<string, unknown>;
  voice?: string;
  pageExtractor?: PageExtractorService;
  interactiveHighlights?: boolean;
  onSessionEnd?: (detail: SessionEndDetail) => void;

  /** Visitor-facing message overrides for localization. English defaults apply per key. */
  messages?: {
    connectionLost?: string;
    sessionEndingSoon?: string;
    failedToStart?: string;
    couldNotConnect?: string;
    connectionError?: string;
    invalidResponse?: string;
  };

  /**
   * Generic extension hook. Called after a token is fetched, with the
   * full parsed response body. Lets wrappers read fields the OSS engine
   * doesn't know about (e.g. custom server metadata).
   */
  onTokenResponse?: (rawResponse: Record<string, unknown>) => void;

  /**
   * Generic extension hook. Called when a tool call arrives whose name
   * isn't recognized by the engine itself. Return a FunctionResponse to
   * handle the call, or null to let the engine fall through to the
   * default "unknown_tool" error. `ctx` exposes engine-internal helpers
   * (e.g. `awaitAudioDrain`) so a handler can defer side effects until
   * buffered audio finishes playing.
   */
  onUnknownToolCall?: (call: ToolCall, ctx: ToolCallContext) => Promise<FunctionResponse | null>;

  /**
   * Generic extension hook. Called by sendPageContext at session start.
   * Return an array of content parts to use as the seed context, or null
   * to fall through to the default page-DOM image extraction.
   */
  customImageSource?: () => Promise<EnginePart[] | null>;

  /**
   * Returns a previously-saved session resumption handle to seed the engine
   * with at the start of each session. The engine calls this in startSession()
   * to support session resumption across reconnects — wrappers persist the
   * handle to storage and return the current value here.
   *
   * Function-based (rather than a one-time option value) so wrappers can read
   * fresh-from-storage on each session start, after a previous session ended
   * and the wrapper cleared its storage.
   *
   * Return null/undefined to start a fresh session (no resumption).
   */
  getInitialSessionHandle?: () => string | null | undefined;

  /**
   * Fires when the server emits a new session resumption handle, OR when the
   * engine drops a stale handle (after exhausted reconnect attempts).
   * Wrappers persist the handle to storage for session resumption.
   *
   * - String value: the new handle. Wrapper writes it to storage.
   * - null: handle was cleared (engine dropped it). Wrapper deletes it.
   */
  onSessionHandleChange?: (handle: string | null) => void;
}

export class GeminiEngine implements VoiceEngineInterface {
  readonly capabilities: EngineCapabilities = {
    supportedLanguages: ['auto', 'en', 'es', 'ja', 'fr', 'de', 'pt', 'it', 'zh', 'ko', 'hi', 'ar', 'ru'],
    supportsVoiceSelection: true,
    supportsRatePitchVolume: false,
    supportsBargeInPlugins: false,
    alwaysCaptureMic: true,
    supportsOffline: false,
    maxSessionDurationSec: SESSION_MAX_SEC,
    requiresTokenServer: true,
    supportsInteractiveHighlights: false,
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
  private session: WsClient<LiveServerMessage> | null = null;
  private sessionActive = false;
  private currentSpeaker: 'visitor' | 'assistant' = 'visitor';
  private savedSessionHandle: string | null = null;
  private voiceId: string;
  private greetingLang: string | undefined;
  private liveModel?: string;
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
  private sessionMeta: Record<string, unknown> | null = null;
  private sessionEndReason: SessionEndDetail['reason'] = 'user';
  private sessionEndReported = false;
  private sessionEnding = false; // true once an end_session teardown is committed; suppresses interruptions

  constructor(options: GeminiEngineOptions) {
    this.options = options;
    this.tokenManager = new TokenManager(options.tokenServerUrl, options.messages);
    this.pageExtractor = options.pageExtractor ?? new PageExtractorService({ maxImages: 6 });
    this.voiceId = options.voice ?? 'Kore';
    this.timer = new SessionTimer((seconds) => {
      this.updateState({ elapsedSeconds: seconds });
    });
    this.highlightsEnabled = options.interactiveHighlights ?? false;
    if (this.highlightsEnabled) {
      this.pageIndexer = new PageIndexerService();
      this.highlightManager = new HighlightManager();
      this.capabilities.supportsInteractiveHighlights = true;
    }
  }

  async startSession(lang: string, options?: { greetingLang?: string; initialElapsedSeconds?: number }): Promise<void> {
    this.greetingLang = options?.greetingLang;
    const initialElapsed = options?.initialElapsedSeconds ?? 0;
    this.sessionEndReported = false;
    this.sessionEnding = false;
    this.sessionEndReason = 'user';
    this.sessionMeta = null;

    this.sessionActive = true;
    this.retryCount = 0;
    this.savedSessionHandle = this.options.getInitialSessionHandle?.() ?? null;
    this.clearPendingTranscripts();

    this.timer.reset(initialElapsed);

    this.state = {
      status: 'loading',
      currentLang: lang as SupportedLang,
      elapsedSeconds: initialElapsed,
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
      const tokenRes = await this.tokenManager.fetchToken({
        voice: this.voiceId,
        lang,
        pageTitle,
        pageUrl,
        pageContent: pageText,
        ...(this.highlightsEnabled && { interactiveHighlights: true }),
        ...this.options.tokenRequestExtras,
        ...(this.greetingLang && { greetingLang: this.greetingLang }),
      });
      const token = tokenRes.token;
      const sessionMeta = tokenRes.sessionMeta;
      const raw = tokenRes.raw;
      if (tokenRes.model) this.liveModel = tokenRes.model;
      this.sessionMeta = sessionMeta ?? null;
      this.options.onTokenResponse?.(raw ?? {});
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

      // Send initial trigger for greeting
      if (this.session) {
        try {
          this.session.send(encodeText('[Session started]'));
          log.info('Sent session start trigger for greeting');
        } catch (err) {
          log.error('Failed to send session trigger:', err);
        }
      }

      // Start mic capture
      await this.audioCapture.start((base64Pcm) => this.sendAudioFrame(base64Pcm));

      // Start timer
      this.timer.start();
      this.startSessionTimers();

      this.updateState({ status: 'listening' });
      log.info('Session started, lang:', lang);
    } catch (err) {
      if (!this.sessionActive) return;
      if (err instanceof WsHandshakeError && err.closeEvent) {
        await this.handleDisconnect(err.closeEvent);
        return;
      }
      const fallbackMsg = this.options.messages?.failedToStart || 'Failed to start session';
      const message = err instanceof Error ? err.message : fallbackMsg;
      log.error('startSession failed:', message);
      this.updateState({ status: 'error', error: message });
    }
  }

  private scheduleEndAfterPlaybackDrain(reason: SessionEndDetail['reason']): void {
    this.sessionEndReason = reason;
    this.sessionEnding = true;
    this.audioCapture.stop();
    if (this.audioPlayback.playing || this.audioPlayback.bufferedSeconds > 0) {
      this.audioPlayback.onDrained(() => {
        if (this.sessionActive) this.endSession();
      }, END_SESSION_DRAIN_TIMEOUT_MS);
    } else {
      this.endSession();
    }
  }

  /**
   * Resolves when buffered audio finishes playing, or when `timeoutMs`
   * elapses, whichever comes first. Wrappers use this from inside an
   * `onUnknownToolCall` handler to delay tear-down side effects (e.g.
   * `window.location.href`) until the agent's last words have played.
   */
  awaitAudioDrain(timeoutMs = 5000): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      const settle = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      this.audioPlayback.onDrained(settle, timeoutMs);
    });
  }

  endSession(): void {
    this.fireSessionEnd();
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
    this.options.onSessionHandleChange?.(null);
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
    this.sessionEndReason = 'destroy';
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
    if (!settings.voiceId) return;

    // The service closes the socket on an unknown speaker name, so a voice
    // from another engine has to be rejected here rather than sent.
    if (!GEMINI_VOICES.some((v) => v.id === settings.voiceId)) {
      log.warn('Ignoring unknown voice, keeping', this.voiceId, '- got:', settings.voiceId);
      return;
    }

    this.voiceId = settings.voiceId;
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
   *
   * If the engine is configured with a `customImageSource` hook, that
   * runs first. A non-null return overrides the default page-DOM image
   * extraction. A null return falls through to the default.
   */
  private async sendPageContext(): Promise<void> {
    if (!this.session) return;

    if (this.options.customImageSource) {
      const customParts = await this.options.customImageSource();
      if (customParts !== null && customParts.length > 0) {
        try {
          this.session.send(encodeClientContent(customParts, false));
          log.info(`Sent ${customParts.length / 2} custom image(s) as context`);
        } catch (err) {
          log.error('Failed to send custom image context:', err);
        }
        return;
      }
      if (customParts !== null) {
        log.info('customImageSource returned empty array; nothing to send');
        return;
      }
      // null → fall through to page-DOM extraction
    }

    const images = await this.pageExtractor.extractImages();
    const validImages = images.filter(img => img.blob.size > 0);

    if (validImages.length === 0) {
      log.info('No page images to send');
      return;
    }

    const parts: EnginePart[] = [];

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
      this.session.send(encodeClientContent(parts, false));
      log.info(`Sent ${validImages.length} page image(s) as context`);
    } catch (err) {
      log.error('Failed to send page context images:', err);
    }
  }

  /**
   * The socket reaches CLOSING before `onclose` runs, so event-driven state is
   * always a step behind. Falls back to open if `conn` is ever absent, since
   * dropping every frame would be worse than the log noise this avoids.
   */
  private get socketIsOpen(): boolean {
    return this.session?.isOpen ?? false;
  }

  /** Forward one captured mic frame. */
  private sendAudioFrame(base64Pcm: string): void {
    if (!this.sessionActive || !this.socketIsOpen) return;

    try {
      this.session?.send(encodeAudioChunk(base64Pcm));
    } catch { /* socket closed mid-send */ }
  }

  private async processToolCalls(calls: ToolCall[]): Promise<void> {
    const responses = await Promise.all(calls.map(async (call) => {
      log.debug('Tool call:', call.name, JSON.stringify(call.args ?? {}));
      return this.dispatchToolCall(call);
    }));
    if (responses.length === 0 || !this.session) return;
    try {
      log.debug('Sending tool response:', JSON.stringify(responses));
      this.session.send(encodeToolResponse(responses));
    } catch (err) {
      log.error('Failed to send tool response:', err);
    }
  }

  private async dispatchToolCall(call: ToolCall): Promise<FunctionResponse> {
    const name = call.name ?? 'unknown';

    if (call.name === 'highlight_and_scroll' && this.highlightsEnabled) {
      const elementId = call.args?.elementId as string | undefined;
      const els = elementId ? this.elementMap.get(elementId) : undefined;
      if (els && els.length > 0 && this.highlightManager) {
        this.highlightManager.highlightElements(els);
        log.info('Highlighted element:', elementId);
        return { id: call.id, name, response: { output: { highlighted: elementId } } };
      }
      log.info('Element not found or detached:', elementId);
      return { id: call.id, name, response: { error: { reason: 'element_not_found', elementId } } };
    }

    if (call.name === 'end_session') {
      this.scheduleEndAfterPlaybackDrain('agent');
      log.info('Agent requested end_session; scheduling teardown after playback drain');
      return { id: call.id, name, response: { output: { ended: true } } };
    }

    if (this.options.onUnknownToolCall) {
      const ctx: ToolCallContext = {
        awaitAudioDrain: (timeoutMs?: number) => this.awaitAudioDrain(timeoutMs),
      };
      const handled = await this.options.onUnknownToolCall(call, ctx);
      if (handled) return handled;
    }

    log.warn('Unknown tool call, responding with error:', call.name);
    return {
      id: call.id,
      name,
      response: { error: { reason: 'unknown_tool', name: call.name ?? null } },
    };
  }

  private async connect(token: string): Promise<void> {
    const model = this.liveModel || DEFAULT_MODEL;
    const url = buildLiveUrl(token);
    const handshake = buildSetupFrame(model, this.savedSessionHandle);

    this.session = await WsClient.connect<LiveServerMessage>({
      url,
      handshake,
      isHandshakeAck: isSetupComplete,
      onMessage: (message: LiveServerMessage) => {
        this.handleMessage(message);
      },
      onError: (error: Event) => {
        log.error('WebSocket error:', (error as any)?.message ?? error);
        this.handleDisconnect();
      },
      onClose: (event: CloseEvent) => {
        log.info('WebSocket closed:', event.code, event.reason);
        if (this.sessionActive) {
          this.handleDisconnect(event);
        }
      },
    });

    log.info('WebSocket connected');
    this.retryCount = 0;
  }

  private handleMessage(message: LiveServerMessage): void {
    const content = message.serverContent;

    // Tool calls are synchronous: the model pauses output until we send a
    // FunctionResponse. Built-in handler is highlight_and_scroll (when
    // interactiveHighlights is enabled). Anything else falls through to
    // onUnknownToolCall if a wrapper provided one.
    if (message.toolCall?.functionCalls) {
      void this.processToolCalls(message.toolCall.functionCalls);
    }

    if (message.toolCallCancellation) {
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
        if (part.text) {
          log.debug('Model text part:', part.text);
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
    if (content?.interrupted && !this.sessionEnding) {
      this.audioPlayback.clear();
      this.clearPendingTranscripts();
      if (this.highlightsEnabled && this.highlightManager) {
        this.highlightManager.clearImmediately();
      }
      this.updateState({ status: 'listening', interimTranscript: '' });
    }

    // Turn complete
    if (content?.turnComplete || content?.generationComplete) {
      const fallbackMs = this.audioPlayback.bufferedSeconds * 1000 + DRAIN_FALLBACK_MARGIN_MS;
      this.audioPlayback.onDrained(() => {
        if (this.sessionActive) {
          this.clearPendingTranscripts();
          if (this.highlightsEnabled && this.highlightManager) {
            this.highlightManager.fadeOut();
          }
          this.updateState({ status: 'listening', interimTranscript: '' });
        }
      }, fallbackMs);
    }

    // Session resumption
    if (message.sessionResumptionUpdate?.resumable && message.sessionResumptionUpdate?.newHandle) {
      this.savedSessionHandle = message.sessionResumptionUpdate.newHandle;
      this.options.onSessionHandleChange?.(message.sessionResumptionUpdate.newHandle);
    }

    // GoAway -- server requesting disconnect
    if (message.goAway) {
      log.info('Received goAway, reconnecting...');
      this.audioCapture.stop();
      this.reconnectWithResumption();
    }
  }

  private async handleDisconnect(event?: CloseEvent): Promise<void> {
    if (!this.sessionActive) return;

    // Stop audio capture immediately to prevent send-on-closed-socket spam
    this.audioCapture.stop();

    const terminalCheck = isTerminalCloseEvent(event);
    if (terminalCheck.isTerminal) {
      log.error('Terminal WebSocket closure, skipping retry:', event?.code, event?.reason);
      this.sessionEndReason = 'error';
      this.fireSessionEnd();
      const errorMsg = terminalCheck.message || this.options.messages?.connectionLost || 'Connection lost';
      this.updateState({ status: 'error', error: errorMsg });
      this.endSession();
      return;
    }

    if (this.retryCount >= GeminiEngine.MAX_RETRIES) {
      // Before giving up: if we have a handle, it might be stale (e.g., past
      // its 2-hour TTL from a prior tab session). Drop it and try fresh-connect
      // with a full retry budget. Termination is guaranteed because the
      // recursion clears the handle, so the next exhaustion can't re-enter.
      if (this.savedSessionHandle) {
        log.info('Max retries reached with handle. Dropping handle and retrying fresh.');
        this.savedSessionHandle = null;
        this.options.onSessionHandleChange?.(null);
        this.retryCount = 0;
        await this.reconnectWithResumption();
        return;
      }
      this.sessionEndReason = 'error';
      this.fireSessionEnd();
      const connLostMsg = this.options.messages?.connectionLost || 'Connection lost';
      this.updateState({ status: 'error', error: connLostMsg });
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

      const tokenRes = await this.tokenManager.fetchToken({
        voice: this.voiceId,
        lang: this.state.currentLang,
        pageTitle,
        pageUrl,
        pageContent: pageText,
        ...(this.highlightsEnabled && { interactiveHighlights: true }),
        ...this.options.tokenRequestExtras,
        ...(this.greetingLang && { greetingLang: this.greetingLang }),
      });
      const token = tokenRes.token;
      const raw = tokenRes.raw;
      if (tokenRes.model) this.liveModel = tokenRes.model;
      if (!this.sessionActive) return;
      this.options.onTokenResponse?.(raw ?? {});

      await this.connect(token);
      if (!this.sessionActive) return;

      await this.sendPageContext();
      if (!this.sessionActive) return;

      // Restart audio capture after successful reconnect
      await this.audioCapture.start((base64Pcm) => this.sendAudioFrame(base64Pcm));

      log.info('Reconnected with session resumption');
    } catch (err) {
      log.error('Reconnection failed:', err);
      if (this.sessionActive) {
        this.handleDisconnect(err instanceof WsHandshakeError ? err.closeEvent : undefined);
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

      const tokenRes = await this.tokenManager.fetchToken({
        voice: this.voiceId,
        lang,
        pageTitle,
        pageUrl,
        pageContent: pageText,
        ...(this.highlightsEnabled && { interactiveHighlights: true }),
        ...this.options.tokenRequestExtras,
        ...(this.greetingLang && { greetingLang: this.greetingLang }),
      });
      const token = tokenRes.token;
      const raw = tokenRes.raw;
      if (tokenRes.model) this.liveModel = tokenRes.model;
      if (!this.sessionActive) return;
      this.options.onTokenResponse?.(raw ?? {});

      this.savedSessionHandle = null;
      await this.connect(token);
      if (!this.sessionActive) return;

      await this.sendPageContext();
      if (!this.sessionActive) return;

      await this.audioCapture.start((base64Pcm) => this.sendAudioFrame(base64Pcm));

      this.updateState({ status: 'listening' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to switch language';
      this.updateState({ status: 'error', error: message });
    }
  }

  private fireSessionEnd(): void {
    if (!this.sessionActive) return;
    if (this.sessionEndReported) return;
    if (!this.options.onSessionEnd) return;

    this.sessionEndReported = true;

    this.options.onSessionEnd({
      duration: this.timer.elapsed,
      reason: this.sessionEndReason,
      sessionMeta: this.sessionMeta ?? undefined,
    });
  }

  private startSessionTimers(): void {
    const elapsed = this.timer.elapsed;
    const warningRemaining = Math.max(0, SESSION_WARNING_SEC - elapsed);
    const maxRemaining = Math.max(0, SESSION_MAX_SEC - elapsed);

    const warningMsg = this.options.messages?.sessionEndingSoon || 'Session ending in 3 minutes';
    this.sessionWarningTimeout = setTimeout(() => {
      this.updateState({ error: warningMsg });
      setTimeout(() => {
        if (this.state.error === warningMsg) {
          this.updateState({ error: null });
        }
      }, 5000);
    }, warningRemaining * 1000);

    this.sessionEndTimeout = setTimeout(() => {
      this.sessionEndReason = 'timeout';
      this.endSession();
    }, maxRemaining * 1000);
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

function isTerminalCloseEvent(event?: CloseEvent): { isTerminal: boolean; message?: string } {
  if (!event) return { isTerminal: false };

  const code = event.code;
  const reason = (event.reason || '').toLowerCase();

  // Quota Exceeded / Rate Limit / Billing / Resource Exhausted
  if (
    reason.includes('quota') ||
    reason.includes('exceeded') ||
    reason.includes('resource_exhausted') ||
    reason.includes('billing') ||
    reason.includes('rate limit') ||
    reason.includes('429')
  ) {
    return {
      isTerminal: true,
      message: 'API quota exceeded. Please check your plan or try again later.',
    };
  }

  // Auth / Permission / Token failures
  if (
    code === 4001 ||
    code === 4003 ||
    code === 4401 ||
    reason.includes('unauthorized') ||
    reason.includes('forbidden') ||
    reason.includes('permission_denied') ||
    reason.includes('invalid key')
  ) {
    return {
      isTerminal: true,
      message: 'Authentication failed. Please check your configuration.',
    };
  }

  // Invalid argument / Bad Request
  if (code === 4000 || reason.includes('invalid argument')) {
    return {
      isTerminal: true,
      message: 'Invalid session configuration.',
    };
  }

  // Policy violation (1007) is a rejected session config, e.g. an unknown
  // voice name. Retrying resends the same config, so it can only fail again.
  if (code === 1007) {
    return {
      isTerminal: true,
      message: event.reason
        ? `Invalid session configuration: ${event.reason}`
        : 'Invalid session configuration.',
    };
  }

  return { isTerminal: false };
}
