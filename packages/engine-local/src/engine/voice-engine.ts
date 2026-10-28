import { PageExtractorService, PageIndexerService, HighlightManager, SessionTimer, createLogger, type IndexedImage } from '@ariontalk/core';
import type { VoiceEngineInterface, EngineCapabilities, EngineErrorCode, VoiceInfo, VoiceEngineState, SupportedLang, VoiceSettings, BargeInDetector, SpeechSynthesizer } from '@ariontalk/core';
import { SpeechRecognitionService, resolveRecognitionLang } from '../services/speech-recognition.js';
import type { SpeechLocalMode, SpeechLocalStatus } from '../services/speech-recognition.js';
import { SpeechSynthesisService } from '../services/speech-synthesis.js';
import { CompositeSynthesizer } from '../services/composite-synthesizer.js';
import { AISessionService } from '../services/ai-session.js';
import { InputLevelMeter } from '../services/input-level-meter.js';
import { preparePageImages, type PageImage, type PreparedImages } from '../services/page-images.js';
import { parseActionTags, holdBackPartialTag } from '../services/action-tag-parser.js';
import { TurnCaptions } from '../services/turn-captions.js';
import { formatFor } from '../services/image-format.js';

const log = createLogger('voice-engine');

const RECOGNITION_ERRORS: Record<string, string> = {
  'not-allowed':
    'Microphone access is blocked. Please allow microphone access and try again.',
  'service-not-allowed':
    'Microphone access is blocked. Please allow microphone access and try again.',
  'audio-capture':
    'No microphone was found. Please connect a microphone and try again.',
  'network':
    'Speech recognition was interrupted. Try restarting the session.',
  'speech-local-unavailable':
    'On-device speech recognition is not available on this device.',
  'speech-recognition-unavailable':
    'Speech recognition stopped unexpectedly. Try restarting the session.',
};

const RECOGNITION_ERROR_CODES: Record<string, EngineErrorCode> = {
  'not-allowed': 'mic-blocked',
  'service-not-allowed': 'mic-blocked',
  'audio-capture': 'mic-not-found',
  'speech-local-unavailable': 'speech-unavailable',
  'speech-recognition-unavailable': 'speech-stopped',
  'network': 'speech-stopped',
};

const TERMINAL_RECOGNITION_ERRORS = new Set([
  'not-allowed',
  'service-not-allowed',
  'audio-capture',
  'speech-local-unavailable',
]);

function isOutOfMemoryError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = typeof (err as { name?: unknown }).name === 'string' ? (err as { name: string }).name : '';
  const msg = typeof (err as { message?: unknown }).message === 'string' ? (err as { message: string }).message : '';
  return /out of memory|not enough memory|insufficient\s+memory|low memory/i.test(`${name} ${msg}`);
}

/** Spoken on session start, mirroring the cloud engine's opening turn. */
const GREETINGS: Record<string, string> = {
  en: 'Hi. Ask me anything about this page.',
  es: 'Hola. Preguntame lo que quieras sobre esta pagina.',
};

/**
 * Pick the greeting language. Uses the session language if explicit, falls
 * back to the detected page greeting language when 'auto', and finally
 * defaults to English.
 */
function resolveGreetingLang(lang: SupportedLang, greetingLang?: string): SupportedLang {
  if (lang !== 'auto' && GREETINGS[lang]) return lang;
  if (greetingLang && GREETINGS[greetingLang]) return greetingLang;
  return 'en';
}

// Grace period before showing indeterminate progress for unmeasured downloads.
const VOICE_PROGRESS_STALL_MS = 1500;

/** Maps download progress to widget encoding: 0-1 for fraction, -1 for indeterminate, 0 for idle/cached. */
function createProgressMapper(): { map: (loaded: number) => number; arm: () => void } {
  let sawDownload = false;
  return {
    map(loaded) {
      const isFraction = loaded > 0 && loaded < 1;
      if (isFraction) sawDownload = true;
      return isFraction ? loaded : sawDownload ? -1 : 0;
    },
    arm() {
      sawDownload = true;
    },
  };
}

export interface VoiceEngineOptions {
  bargeInDetector?: BargeInDetector;
  synthesizer?: SpeechSynthesizer;
  interactiveHighlights?: boolean;
  speechLocal?: SpeechLocalMode;
  /** Share page images with the model when the browser supports it. Requires interactiveHighlights. Default: true. */
  imageContext?: boolean;
}

export class VoiceEngine implements VoiceEngineInterface {
  private pageExtractor = new PageExtractorService({ maxImages: 2 });
  private pageIndexer: PageIndexerService | null = null;
  private highlightManager: HighlightManager | null = null;
  private elementMap: Map<string, Element[]> | null = null;
  private recognition = new SpeechRecognitionService();
  private meter = new InputLevelMeter();
  private recognitionStatus: SpeechLocalStatus | null = null;
  private synthesis: CompositeSynthesizer;
  private ai = new AISessionService();
  private bargeIn: BargeInDetector | null;
  private timer: SessionTimer;
  private sessionActive = false;
  private bargeInTriggered = false;
  private turnId = 0;
  private muted = false;
  private selfSpeaking = false;
  private aiProgress = 0;
  private aiOutOfMemory = false;
  private terminalError = false;
  private errorTimer: ReturnType<typeof setTimeout> | null = null;
  /** The AI init currently in flight, so an early transcript can await it. */
  private aiReady: Promise<void> | null = null;
  /** True only while the model is actually downloading, which is worth blocking for. */
  private aiNeedsDownload = false;
  /** The availability check behind `aiNeedsDownload`, so the gate waits for its verdict. */
  private aiAvailability: Promise<unknown> | null = null;
  private interactiveHighlights: boolean;
  private imageContext: boolean;
  private captions = new TurnCaptions();

  readonly capabilities: EngineCapabilities = {
    supportedLanguages: ['auto', 'en', 'es'],
    supportsVoiceSelection: true,
    supportsRatePitchVolume: true,
    supportsBargeInPlugins: true,
    supportsTtsPlugins: true,
    alwaysCaptureMic: false,
    supportsOffline: true,
    maxSessionDurationSec: null,
    requiresTokenServer: false,
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

  /** Callback for state change notifications. */
  onStateChange: ((state: VoiceEngineState) => void) | null = null;

  constructor(options?: VoiceEngineOptions) {
    const systemSynthesis = new SpeechSynthesisService();
    this.synthesis = new CompositeSynthesizer(
      systemSynthesis,
      options?.synthesizer ?? null
    );
    systemSynthesis.onVoicesChanged = () => this.updateOnDevice();
    this.interactiveHighlights = options?.interactiveHighlights ?? false;
    this.imageContext = options?.imageContext ?? true;
    this.bargeIn = options?.bargeInDetector ?? null;
    this.recognition.setLocalMode(options?.speechLocal ?? 'prefer');

    if (this.interactiveHighlights) {
      this.pageIndexer = new PageIndexerService({ includeImages: true });
      this.highlightManager = new HighlightManager();
      this.capabilities.supportsInteractiveHighlights = true;
    }

    this.timer = new SessionTimer((seconds) => {
      this.updateState({ elapsedSeconds: seconds });
    });

    this.recognition.onInterimResult = (text) => {
      if (this.terminalError) return;
      const userSpeaking = this.state.status === 'listening' && !this.muted
        ? true
        : this.state.userSpeaking;
      this.updateState({ interimTranscript: text, userSpeaking });
    };

    this.recognition.onFinalResult = (text) => {
      if (this.terminalError) return;
      log.debug('STT →', text);
      if (this.state.userSpeaking) {
        this.updateState({ userSpeaking: false });
      }
      this.handleFinalTranscript(text);
    };

    this.recognition.onError = (error) => {
      this.setError(RECOGNITION_ERRORS[error] ?? error, {
        code: RECOGNITION_ERROR_CODES[error],
        terminal: TERMINAL_RECOGNITION_ERRORS.has(error),
      });
    };

    this.recognition.onLocalStatusChange = (status) => {
      this.recognitionStatus = status;
      this.updateOnDevice();
    };

    this.meter.onError = (error) => {
      if (error === 'NotAllowedError') {
        this.setError(RECOGNITION_ERRORS['not-allowed'], {
          code: 'mic-blocked',
          terminal: true,
        });
      } else if (error === 'NotFoundError') {
        this.setError(RECOGNITION_ERRORS['audio-capture'], {
          code: 'mic-not-found',
          terminal: true,
        });
      }
    };

    this.captions.onChange = (text) => {
      if (this.sessionActive) this.updateState({ interimTranscript: text });
    };
  }

  private computeOnDevice(): boolean | undefined {
    if (this.recognitionStatus === null) return undefined;
    if (this.recognitionStatus !== 'on-device') return false;
    const activeVoice = this.resolveActiveVoice(this.state.currentLang);
    return Boolean(activeVoice?.local);
  }

  private resolveActiveVoice(lang: SupportedLang): VoiceInfo | null {
    const voices = this.getVoices();
    if (voices.length === 0) return null;

    const overrides = this.getVoiceOverrides();
    if (overrides?.voiceId) {
      const matched = voices.find((v) => v.id === overrides.voiceId);
      if (matched) return matched;
    }

    const resolvedLang = lang === 'auto' ? resolveRecognitionLang('auto') : lang;
    const prefix = resolvedLang.split('-')[0].toLowerCase();
    const langVoices = voices.filter((v) => v.lang.toLowerCase().startsWith(prefix));
    const pool = langVoices.length > 0 ? langVoices : voices;
    return pool.find((v) => v.local) ?? pool[0] ?? null;
  }

  private updateOnDevice(): void {
    const next = this.computeOnDevice();
    if (this.state.onDevice !== next) {
      this.updateState({ onDevice: next });
    }
  }

  private notifyStateChange(): void {
    this.onStateChange?.(this.state);
  }

  private updateState(partial: Partial<VoiceEngineState>): void {
    if (this.terminalError && partial.status !== undefined && partial.status !== 'error' && partial.status !== 'idle') {
      const { status: _, ...rest } = partial;
      partial = rest;
    }
    const next: VoiceEngineState = { ...this.state, ...partial };
    if (partial.status !== undefined && partial.status !== 'error') {
      next.error = null;
      next.errorCode = undefined;
    }
    this.state = next;
    this.notifyStateChange();
  }

  /** Our own audio just became audible. */
  private handleSpeechStart(): void {
    this.timer.start();
    if (this.selfSpeaking) return;
    this.selfSpeaking = true;
    this.armBargeIn();
  }

  private armBargeIn(): void {
    if (!this.sessionActive || this.terminalError || this.muted || !this.selfSpeaking) return;
    this.bargeIn?.startMonitoring(() => this.handleBargeIn());
  }

  /**
   * Resolves availability for `lang`, records whether a download is pending, and
   * returns the progress hook for one. Shared by session start and language switch
   * so both decide on the current language rather than a stale verdict.
   */
  private async prepareAIDownload(lang: SupportedLang): Promise<((loaded: number) => void) | undefined> {
    // Published before the first await so the download gate can wait on the verdict.
    const availability = AISessionService.checkAvailability(lang);
    this.aiAvailability = availability;

    const needsDownload = ['downloadable', 'downloading'].includes(await availability);
    if (!this.sessionActive) return undefined;

    this.aiNeedsDownload = needsDownload;
    this.aiProgress = 0;
    if (!needsDownload) return undefined;

    const aiBarValue = createProgressMapper();
    return (loaded: number) => {
      this.aiProgress = aiBarValue.map(loaded);
      // The voice stage owns the bar until the greeting ends.
      if (this.state.loadingStage === 'ai') this.updateState({ downloadProgress: this.aiProgress });
    };
  }

  private async initAI(lang: SupportedLang): Promise<void> {
    this.aiOutOfMemory = false;
    try {
      const onProgress = await this.prepareAIDownload(lang);
      if (!this.sessionActive) return;

      await this.createAISession(lang, onProgress);
    } catch (err) {
      if (isOutOfMemoryError(err)) {
        this.aiOutOfMemory = true;
        if (this.sessionActive) {
          this.setError('Your browser does not have enough memory for the AI model.', {
            code: 'model-memory',
            terminal: true,
          });
        }
        return;
      }
      log.warn('AI unavailable:', err);
    }
  }

  private async createAISession(lang: SupportedLang, onProgress?: (loaded: number) => void): Promise<void> {
    const index = this.pageIndexer?.buildIndex() ?? null;
    if (index === null) {
      log.info('image context off: no highlights');
      await this.ai.init(this.pageExtractor.extractText(), lang, onProgress, { interactiveHighlights: false });
      return;
    }

    const wantImages = this.imageContext && index.images.length > 0;
    const imageAvailability = wantImages
      ? await AISessionService.checkAvailability(lang, { image: true })
      : 'unavailable';

    if (!this.sessionActive) return;

    const prepared: PreparedImages = imageAvailability === 'available'
      ? await preparePageImages(index.images)
      : { attached: [], skipped: [] };

    const n = prepared.attached.length;
    const ladder: PageImage[][] = [];
    if (n === 0) {
      ladder.push([]);
    } else if (n === 1) {
      ladder.push(prepared.attached);
      ladder.push([]);
    } else {
      ladder.push(prepared.attached);
      ladder.push(prepared.attached.slice(0, Math.ceil(n / 2)));
      ladder.push([]);
    }

    let successfulAttempt: PageImage[] | null = null;
    try {
      for (let i = 0; i < ladder.length; i++) {
        const attempt = ladder[i];
        const attachedIds = new Set(attempt.map((img) => img.id));
        this.pageIndexer!.setImageFormat(formatFor(attachedIds, prepared));
        const text = this.pageIndexer!.buildIndex().annotatedText;

        try {
          await this.ai.init(text, lang, onProgress, {
            interactiveHighlights: this.interactiveHighlights,
            images: attempt,
          });
          successfulAttempt = attempt;
          break;
        } catch (err: any) {
          if (i === ladder.length - 1) {
            throw err;
          }
          const nextCount = ladder[i + 1].length;
          log.warn(`session create failed with ${attempt.length} images, retrying with ${nextCount}:`, err?.name, err?.message);
        }
      }
    } finally {
      for (const img of prepared.attached) {
        img.close();
      }
    }

    this.elementMap = index.elementMap;

    const skippedList = prepared.skipped.map((s) => `${s.id} ${s.reason}`).join(', ');

    if (successfulAttempt && successfulAttempt.length > 0) {
      const attachedStr = successfulAttempt.map((img) => img.id).join(', ');
      const skippedStr = skippedList ? `, skipped [${skippedList}]` : '';
      log.info(`image context on: attached [${attachedStr}]${skippedStr}`);
    } else {
      const offReason = (): string => {
        if (!this.imageContext) return 'disabled';
        if (!this.interactiveHighlights) return 'no highlights';
        if (index.images.length === 0) return 'no images on page';
        if (imageAvailability !== 'available') return imageAvailability;
        if (prepared.attached.length === 0) return `all images skipped [${skippedList}]`;
        return 'session create failed with images, running text only';
      };
      log.info(`image context off: ${offReason()}`);
    }
  }

  /** Start a new voice session: extract page → init AI → start listening. */
  async startSession(lang: SupportedLang, options?: { greetingLang?: string; initialElapsedSeconds?: number }): Promise<void> {
    const initialElapsed = options?.initialElapsedSeconds ?? 0;
    this.sessionActive = true;
    if (this.errorTimer) {
      clearTimeout(this.errorTimer);
      this.errorTimer = null;
    }
    this.aiOutOfMemory = false;
    this.terminalError = false;
    ++this.turnId;
    this.recognitionStatus = null;
    this.timer.reset(initialElapsed);

    const waitsForVoice = this.synthesis.willUseActive(lang);
    this.state = {
      status: 'loading',
      currentLang: lang,
      elapsedSeconds: initialElapsed,
      interimTranscript: '',
      error: null,
      errorCode: undefined,
      downloadProgress: 0,
      loadingStage: waitsForVoice ? 'voice' : 'connecting',
    };
    this.notifyStateChange();

    // Mic for barge-in. Non-blocking; arming waits for audio to actually play.
    this.bargeIn?.init().then(() => this.armBargeIn()).catch(() => {});

    if (this.interactiveHighlights && this.highlightManager) {
      this.highlightManager.init();
    }

    // Download AI model in background while greeting prepares.
    this.aiReady = this.initAI(lang);

    if (waitsForVoice) {
      const progress = createProgressMapper();
      const stall = setTimeout(() => {
        if (this.state.loadingStage !== 'voice' || this.state.downloadProgress !== 0) return;
        progress.arm();
        this.updateState({ downloadProgress: -1 });
      }, VOICE_PROGRESS_STALL_MS);
      try {
        await this.synthesis.init(
          (loaded) => this.updateState({ downloadProgress: progress.map(loaded) }),
        );
      } catch (err) {
        log.warn('Voice model unavailable, using system voices:', err);
      } finally {
        clearTimeout(stall);
      }
    } else {
      void this.synthesis.initBase().catch(() => {});
    }
    if (!this.sessionActive || this.aiOutOfMemory || this.terminalError) return;

    await this.playGreeting(resolveGreetingLang(lang, options?.greetingLang));
    if (!this.sessionActive || this.aiOutOfMemory || this.terminalError) return;

    // Settle the download question before gating on it. Availability resolves long
    // before the greeting in practice, so this is a microtask; without it a slow
    // check would default to "no download" and skip a block that was warranted.
    if (this.aiAvailability) await this.aiAvailability;
    if (!this.sessionActive || this.aiOutOfMemory || this.terminalError) return;

    // A download is worth blocking for and has a progress bar. A warm-up is
    // neither, and listening does not need the model, so start it and let the model
    // land in the background.
    if (this.aiNeedsDownload && !this.ai.isReady) {
      this.timer.stop();
      this.updateState({ status: 'loading', loadingStage: 'ai', downloadProgress: this.aiProgress });
      await this.aiReady;
      if (!this.sessionActive || this.aiOutOfMemory || this.terminalError) return;
    }

    this.beginListening();
  }

  /** Speak the opening greeting, then hand over to listening. */
  private async playGreeting(greetLang: SupportedLang): Promise<void> {
    this.updateState({ status: 'speaking', downloadProgress: 0 });

    const text = GREETINGS[greetLang] ?? GREETINGS.en;
    log.debug('TTS ←', text);

    const rate = this.synthesis.getVoiceOverrides()?.rate ?? 1;
    const cap = this.captions.utterance(text, { rate });
    try {
      await this.synthesis.enqueue(text, greetLang, {
        onStart: (meta) => {
          if (!this.sessionActive) return;
          this.handleSpeechStart();
          cap.start(meta);
        },
        onBoundary: (i) => cap.boundary(i),
      });
      cap.end();
    } catch (err) {
      log.warn('Greeting unavailable:', err);
    } finally {
      this.captions.reset();
      this.selfSpeaking = false;
      this.bargeIn?.stopMonitoring();
      // Interrupting the greeting must not suppress the next turn's speech.
      this.bargeInTriggered = false;
    }
  }

  /** Move to the listening state and (re)start recognition. */
  private beginListening(): void {
    if (this.terminalError) return;
    this.timer.start();
    this.updateState({
      status: 'listening',
      downloadProgress: 0,
      interimTranscript: '',
      userSpeaking: false,
    });

    if (this.muted) return;

    this.meter.resume();
    try {
      this.recognition.start(this.state.currentLang);
    } catch (err) {
      log.warn('Speech recognition unavailable:', err);
    }
  }

  /** End the current session and clean up all services. */
  endSession(): void {
    this.sessionActive = false;
    if (this.errorTimer) {
      clearTimeout(this.errorTimer);
      this.errorTimer = null;
    }
    this.captions.reset();
    this.muted = false;
    this.selfSpeaking = false;
    this.bargeIn?.destroy();
    this.meter.stop();
    this.recognition.stop();
    this.synthesis.cancel();
    this.highlightManager?.destroy();
    this.pageIndexer?.destroy();
    this.ai.destroy();
    this.timer.reset();
    this.pageExtractor.destroy();
    this.elementMap = null;
    this.aiNeedsDownload = false;
    this.aiOutOfMemory = false;
    this.terminalError = false;
    ++this.turnId;
    this.aiReady = null;
    this.aiAvailability = null;
    this.recognitionStatus = null;

    this.state = {
      status: 'idle',
      currentLang: this.state.currentLang,
      elapsedSeconds: 0,
      interimTranscript: '',
      error: null,
      errorCode: undefined,
      downloadProgress: 0,
      userSpeaking: false,
    };
    this.notifyStateChange();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.bargeIn?.stopMonitoring();
      this.meter.release();
      if (this.state.status === 'listening') {
        this.recognition.pause();
        this.updateState({ interimTranscript: '', userSpeaking: false });
      } else if (this.state.userSpeaking) {
        this.updateState({ userSpeaking: false });
      }
    } else {
      if (this.terminalError) return;
      if (this.bargeIn) {
        this.armBargeIn();
      }
      if (this.state.status === 'listening') {
        this.meter.resume();
        this.recognition.resume();
      }
    }
  }

  applyVoiceSettings(settings: VoiceSettings): void {
    this.synthesis.applyVoiceSettings(settings);
    this.updateOnDevice();
  }

  getVoiceOverrides(): VoiceSettings | null {
    return this.synthesis.getVoiceOverrides();
  }

  getVoices(): VoiceInfo[] {
    return this.synthesis.getVoices();
  }

  getAudioLevels(): { input: number; output: number | null } {
    return {
      input: this.meter.level,
      output: this.synthesis.getOutputLevel?.() ?? null,
    };
  }

  /** Switch recognition + synthesis + AI language mid-session. */
  switchLanguage(lang: SupportedLang): void {
    this.updateState({ currentLang: lang });

    this.recognition.setLanguage(lang);
    this.updateOnDevice();

    if (this.synthesis.willUseActive(lang)) {
      void this.synthesis.init().catch((err) => log.warn('Voice model unavailable:', err));
    }

    // Re-initialize AI with new language preference
    this.aiReady = this.reinitAI(lang);
  }

  private turnLive(turn: number): boolean {
    return turn === this.turnId && this.sessionActive && !this.terminalError;
  }

  /** Handle a finalized transcript from speech recognition. */
  private async handleFinalTranscript(text: string): Promise<void> {
    if (this.terminalError || !text.trim()) return;
    const turn = ++this.turnId;

    // The user has spoken and the model is still coming up. Show that we are
    // working on it and answer when it lands, rather than telling them to try again.
    if (!this.ai.isReady) {
      this.recognition.pause();
      this.meter.pause();
      this.updateState({ status: 'thinking', interimTranscript: '', userSpeaking: false });
      await this.aiReady;
      if (!this.turnLive(turn)) return;
      if (!this.ai.isReady) {
        if (this.aiOutOfMemory) {
          this.setError('Your browser does not have enough memory for the AI model.', {
            code: 'model-memory',
            terminal: true,
          });
        } else {
          this.setError('AI model is unavailable. Please try again.', {
            code: 'model-unavailable',
          });
        }
        return;
      }
    }

    // Pause recognition while AI processes
    this.recognition.pause();
    this.meter.pause();

    this.updateState({
      status: 'thinking',
      interimTranscript: '',
      userSpeaking: false,
    });

    // Clear any prior speech before streaming new response
    this.synthesis.cancel();
    this.bargeInTriggered = false;

    const speechQueue: Promise<void>[] = [];
    const lang = this.state.currentLang;

    try {
      let buffer = '';
      let firstSentenceEnqueued = false;

      const applyHighlight = (id: string) => {
        if (!this.elementMap || !this.highlightManager) return;
        const els = this.elementMap.get(id);
        if (els && els.length > 0) {
          this.highlightManager.highlightElements(els);
        } else {
          log.debug('Unresolved highlight ID:', id);
        }
      };

      // A tag can arrive as its own fragment with no speakable text next to it
      // (the model commonly emits one at the very end of a turn). Such IDs are
      // held here until there is an utterance to bind them to.
      let pendingIds: string[] = [];
      let lastSlot: { id: string | null; started: boolean } | null = null;

      const processSentence = (rawSentence: string) => {
        if (!this.turnLive(turn)) return;
        const sanitized = this.sanitizeForSpeech(rawSentence);

        let clean = sanitized;
        let matchedIds: string[] = [];

        if (this.interactiveHighlights) {
          const parsed = parseActionTags(sanitized);
          clean = parsed.clean;
          matchedIds = parsed.ids;
        }

        if (!clean) {
          if (matchedIds.length > 0) pendingIds.push(...matchedIds);
          return;
        }

        log.debug('TTS ←', clean);

        if (!firstSentenceEnqueued) {
          firstSentenceEnqueued = true;
          this.updateState({ status: 'speaking' });
        }

        const slot = this.interactiveHighlights
          ? { id: pendingIds[0] ?? matchedIds[0] ?? null, started: false }
          : null;

        if (slot) {
          pendingIds = [];
          lastSlot = slot;
        }

        const overrides = this.synthesis.getVoiceOverrides();
        const rate = overrides?.rate ?? 1.0;
        const cap = this.captions.utterance(clean, { rate });

        speechQueue.push(this.synthesis.enqueue(clean, lang, {
          onStart: (meta) => {
            if (this.bargeInTriggered || !this.turnLive(turn)) return;
            this.handleSpeechStart();
            cap.start(meta);

            if (slot) {
              slot.started = true;
              if (slot.id) applyHighlight(slot.id);
            }
          },
          onBoundary: (i) => cap.boundary(i),
        }).then(() => cap.end()));
      };

      // Full unmodified model output for the turn. Logged once when highlights
      // are on so a turn that emits no tag is visible, not silent.
      let rawResponse = '';

      if (!this.turnLive(turn)) return;

      for await (const chunk of this.ai.prompt(text)) {
        if (this.bargeInTriggered || !this.turnLive(turn)) break;

        buffer += chunk;
        rawResponse += chunk;

        let ready = buffer;
        if (this.interactiveHighlights) {
          const heldRes = holdBackPartialTag(buffer);
          ready = heldRes.ready;
          buffer = heldRes.held;
        } else {
          buffer = '';
        }

        const { sentences, remainder } = this.extractSentences(ready);
        buffer = remainder + buffer;

        for (const sentence of sentences) {
          if (this.bargeInTriggered || !this.turnLive(turn)) break;
          processSentence(sentence);
        }
      }

      if (this.interactiveHighlights) {
        log.debug('Raw model output:', JSON.stringify(rawResponse));
      }

      // Flush any remaining buffer as a final utterance
      if (!this.bargeInTriggered && this.turnLive(turn)) {
        let tail = buffer;
        if (this.interactiveHighlights) {
          // Stream ended mid-tag: drop the partial rather than speaking it.
          tail = holdBackPartialTag(tail).ready;
        }
        if (tail.trim()) processSentence(tail);
        buffer = '';
      }

      // Tags left over with no utterance of their own. Bind to the last queued
      // utterance if it has not started yet, otherwise show them now: speech is
      // already playing and waiting longer would mean never showing them.
      if (this.interactiveHighlights && pendingIds.length > 0 && !this.bargeInTriggered && this.turnLive(turn)) {
        const id = pendingIds[0];
        pendingIds = [];
        if (lastSlot && !lastSlot.started) {
          log.debug('Binding trailing highlight to pending utterance:', id);
          lastSlot.id = id;
        } else {
          log.debug('Applying trailing highlight immediately:', id);
          applyHighlight(id);
        }
      }

      // Wait for all queued speech to finish (resolves immediately if canceled)
      await Promise.all(speechQueue);
      if (turn === this.turnId) {
        this.selfSpeaking = false;
        this.bargeIn?.stopMonitoring();
      }

      if (this.interactiveHighlights && !this.bargeInTriggered && this.turnLive(turn)) {
        this.highlightManager?.fadeOut();
      }

      if (this.turnLive(turn)) {
        this.resumeListening();
      }
    } catch (err) {
      if (turn === this.turnId) {
        // Cancel remaining queued utterances on error
        this.selfSpeaking = false;
        this.bargeIn?.stopMonitoring();
        this.synthesis.cancel();
        this.captions.reset();
        this.highlightManager?.clearImmediately();
      }

      if (this.turnLive(turn)) {
        this.setError(err instanceof Error ? err.message : 'Conversation error', {
          code: 'answer-failed',
        });
      }
    }
  }

  /** Cancel speech and resume listening when user speaks during TTS playback. */
  private handleBargeIn(): void {
    if (!this.sessionActive || this.bargeInTriggered) return;

    log.info('Barge-in detected, canceling speech');
    this.bargeInTriggered = true;
    this.captions.reset();
    this.selfSpeaking = false;
    this.synthesis.cancel();
    this.highlightManager?.clearImmediately();
    this.bargeIn?.stopMonitoring();
  }

  /** Extract complete sentences from a text buffer, returning unmatched remainder. */
  private extractSentences(buffer: string): { sentences: string[]; remainder: string } {
    const pattern = /([^.!?]*[.!?]+[\s]*)/g;
    const sentences: string[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(buffer)) !== null) {
      sentences.push(match[1]);
      lastIndex = pattern.lastIndex;
    }

    // Merge short fragments with previous sentence
    const merged: string[] = [];
    for (const s of sentences) {
      if (merged.length > 0 && s.trim().length < 20) {
        merged[merged.length - 1] += s;
      } else {
        merged.push(s);
      }
    }

    return {
      sentences: merged.map(s => s.trim()).filter(Boolean),
      remainder: buffer.slice(lastIndex),
    };
  }

  private resumeListening(): void {
    if (this.terminalError) return;
    this.captions.reset();
    this.updateState({
      status: 'listening',
      interimTranscript: '',
      userSpeaking: false,
    });
    if (!this.muted) {
      this.meter.resume();
      this.recognition.resume();
    }
  }

  private async reinitAI(lang: SupportedLang): Promise<void> {
    this.ai.destroy();
    this.pageIndexer?.invalidate();
    this.aiOutOfMemory = false;
    try {
      // The new language can need its own download, so re-resolve rather than
      // reusing the verdict from session start.
      const onProgress = await this.prepareAIDownload(lang);
      if (!this.sessionActive) return;

      await this.createAISession(lang, onProgress);
    } catch (err) {
      if (isOutOfMemoryError(err)) {
        this.aiOutOfMemory = true;
        this.setError('Your browser does not have enough memory for the AI model.', {
          code: 'model-memory',
          terminal: true,
        });
        return;
      }
      this.setError(err instanceof Error ? err.message : 'Failed to switch language', {
        code: 'language-switch-failed',
      });
    }
  }

  private setError(message: string, opts?: { terminal?: boolean; code?: EngineErrorCode }): void {
    if (this.terminalError && !opts?.terminal) return;
    if (this.errorTimer) {
      clearTimeout(this.errorTimer);
      this.errorTimer = null;
    }
    if (opts?.terminal) {
      this.terminalError = true;
      ++this.turnId;
      this.selfSpeaking = false;
      this.recognition.stop();
      this.meter.release();
      this.bargeIn?.stopMonitoring();
      this.synthesis.cancel();
      this.captions.reset();
      this.highlightManager?.clearImmediately();
    } else {
      this.meter.pause();
    }
    this.updateState({
      status: 'error',
      error: message,
      errorCode: opts?.code,
      userSpeaking: false,
    });

    if (opts?.terminal) return;

    // Auto-dismiss error after 3 seconds, but only resume listening if session is active
    this.errorTimer = setTimeout(() => {
      this.errorTimer = null;
      if (this.terminalError) return;
      if (this.state.status === 'error' && this.sessionActive) {
        this.updateState({
          status: 'listening',
        });

        // Restart recognition in case it died from a fatal error
        if (!this.muted) {
          this.meter.resume();
          try {
            this.recognition.stop();
            this.recognition.start(this.state.currentLang);
          } catch { /* ignore */ }
        }
      }
    }, 3000);
  }

  /** Clean up AI output for speech synthesis: strip markdown, emojis, truncate. */
  private sanitizeForSpeech(text: string): string {
    const clean = text
      // Remove emojis
      .replace(/\p{Extended_Pictographic}/gu, '')
      // Remove markdown bold/italic (paired)
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
      // Remove any remaining stray asterisks (unpaired markdown)
      .replace(/\*+/g, '')
      // Remove markdown headers
      .replace(/^#{1,6}\s+/gm, '')
      // Remove bullet points and list markers
      .replace(/^[\s]*[-*]\s+/gm, '')
      .replace(/^[\s]*\d+\.\s+/gm, '')
      // Collapse multiple newlines/whitespace into single space
      .replace(/\n+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    return clean;
  }

  /** Clean up all resources. Call when the engine is no longer needed. */
  destroy(): void {
    this.endSession();
    this.meter.destroy();
    this.synthesis.destroy();
  }
}
