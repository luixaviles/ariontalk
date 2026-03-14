import { PageExtractorService } from '../services/page-extractor.js';
import { SpeechRecognitionService } from '../services/speech-recognition.js';
import { SpeechSynthesisService } from '../services/speech-synthesis.js';
import { AISessionService } from '../services/ai-session.js';
import { SessionTimer } from '../utils/timer.js';
import { createLogger } from '../utils/logger.js';
import type { VoiceEngineInterface, EngineCapabilities, VoiceInfo, VoiceEngineState, SupportedLang, VoiceSettings, BargeInDetector } from '../types.js';

const log = createLogger('voice-engine');

export interface VoiceEngineOptions {
  bargeInDetector?: BargeInDetector;
}

export class VoiceEngine implements VoiceEngineInterface {
  private pageExtractor = new PageExtractorService();
  private recognition = new SpeechRecognitionService();
  private synthesis = new SpeechSynthesisService();
  private ai = new AISessionService();
  private bargeIn: BargeInDetector | null;
  private timer: SessionTimer;
  private sessionActive = false;
  private bargeInTriggered = false;
  private muted = false;

  readonly capabilities: EngineCapabilities = {
    supportedLanguages: ['en', 'es'],
    supportsVoiceSelection: true,
    supportsRatePitchVolume: true,
    supportsBargeInPlugins: true,
    supportsOffline: true,
    maxSessionDurationSec: null,
    requiresTokenServer: false,
  };

  state: VoiceEngineState = {
    status: 'idle',
    currentLang: 'en',
    elapsedSeconds: 0,
    interimTranscript: '',
    error: null,
    downloadProgress: 0,
  };

  /** Callback for state change notifications. */
  onStateChange: ((state: VoiceEngineState) => void) | null = null;

  constructor(options?: VoiceEngineOptions) {
    this.bargeIn = options?.bargeInDetector ?? null;
    this.timer = new SessionTimer((seconds) => {
      this.state = { ...this.state, elapsedSeconds: seconds };
      this.notifyStateChange();
    });

    this.recognition.onInterimResult = (text) => {
      this.state = { ...this.state, interimTranscript: text };
      this.notifyStateChange();
    };

    this.recognition.onFinalResult = (text) => {
      log.debug('STT →', text);
      this.handleFinalTranscript(text);
    };

    this.recognition.onError = (error) => {
      this.setError(error);
    };
  }

  private notifyStateChange(): void {
    this.onStateChange?.(this.state);
  }

  /** Start a new voice session: extract page → init AI → start listening. */
  async startSession(lang: SupportedLang): Promise<void> {
    this.sessionActive = true;

    this.state = {
      status: 'listening',
      currentLang: lang,
      elapsedSeconds: 0,
      interimTranscript: '',
      error: null,
      downloadProgress: 0,
    };
    this.notifyStateChange();

    // Start listening + timer immediately (don't block on AI init)
    try {
      this.recognition.start(lang);
    } catch (err) {
      log.warn('Speech recognition unavailable:', err);
    }
    this.timer.start();

    // Acquire mic stream for barge-in detection (non-blocking, graceful degradation)
    this.bargeIn?.init().catch(() => {});

    // Check availability, then init AI with monitor only when download is needed
    const pageText = this.pageExtractor.extractText();
    try {
      const availability = await AISessionService.checkAvailability();
      if (!this.sessionActive) return;

      const needsDownload = availability === 'downloadable' || availability === 'downloading';

      if (needsDownload) {
        this.state = { ...this.state, status: 'loading' };
        this.notifyStateChange();
      }

      const onProgress = needsDownload
        ? (loaded: number) => {
            this.state = {
              ...this.state,
              downloadProgress: loaded >= 1 ? -1 : loaded,
            };
            this.notifyStateChange();
          }
        : undefined;

      await this.ai.init(pageText, lang, onProgress);

      if (this.state.status === 'loading' && this.sessionActive) {
        this.state = { ...this.state, status: 'listening', downloadProgress: 0 };
        this.notifyStateChange();
      }
    } catch (err) {
      log.warn('AI unavailable:', err);
    }
  }

  /** End the current session and clean up all services. */
  endSession(): void {
    this.sessionActive = false;
    this.muted = false;
    this.bargeIn?.destroy();
    this.recognition.stop();
    this.synthesis.cancel();
    this.ai.destroy();
    this.timer.reset();
    this.pageExtractor.destroy();

    this.state = {
      status: 'idle',
      currentLang: this.state.currentLang,
      elapsedSeconds: 0,
      interimTranscript: '',
      error: null,
      downloadProgress: 0,
    };
    this.notifyStateChange();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.bargeIn?.stopMonitoring();
      if (this.state.status === 'listening') {
        this.recognition.pause();
        this.state = { ...this.state, interimTranscript: '' };
        this.notifyStateChange();
      }
    } else {
      if (this.state.status === 'speaking' && this.bargeIn) {
        this.bargeIn.startMonitoring(() => this.handleBargeIn());
      }
      if (this.state.status === 'listening') {
        this.recognition.resume();
      }
    }
  }

  applyVoiceSettings(settings: VoiceSettings): void {
    const voice = settings.voiceId
      ? this.synthesis.getAllVoices().find(v => v.voiceURI === settings.voiceId) ?? null
      : null;
    this.synthesis.setVoiceOverrides({ voice, rate: settings.rate, pitch: settings.pitch, volume: settings.volume });
  }

  getVoiceOverrides(): VoiceSettings | null {
    const overrides = this.synthesis.getVoiceOverrides();
    if (!overrides) return null;
    return {
      voiceId: overrides.voice?.voiceURI ?? null,
      rate: overrides.rate,
      pitch: overrides.pitch,
      volume: overrides.volume,
    };
  }

  getVoices(): VoiceInfo[] {
    return this.synthesis.getAllVoices().map(v => ({
      id: v.voiceURI,
      name: v.name,
      lang: v.lang,
      local: v.localService,
    }));
  }

  /** Switch recognition + synthesis + AI language mid-session. */
  switchLanguage(lang: SupportedLang): void {
    this.state = { ...this.state, currentLang: lang };
    this.notifyStateChange();

    this.recognition.setLanguage(lang);

    // Re-initialize AI with new language preference
    this.reinitAI(lang);
  }

  /** Handle a finalized transcript from speech recognition. */
  private async handleFinalTranscript(text: string): Promise<void> {
    if (!text.trim()) return;

    if (!this.ai.isReady) {
      this.recognition.pause();
      this.setError(
        this.state.status === 'loading'
          ? 'AI model is still downloading. Please wait for it to finish.'
          : 'AI model is still loading. Please try again shortly.',
      );
      return;
    }

    // Pause recognition while AI processes
    this.recognition.pause();

    this.state = {
      ...this.state,
      status: 'thinking',
      interimTranscript: '',
    };
    this.notifyStateChange();

    // Clear any prior speech before streaming new response
    this.synthesis.cancel();
    this.bargeInTriggered = false;

    const speechQueue: Promise<void>[] = [];
    const lang = this.state.currentLang;

    try {
      let buffer = '';
      let firstSentenceEnqueued = false;

      for await (const chunk of this.ai.prompt(text)) {
        if (this.bargeInTriggered || !this.sessionActive) break;

        buffer += chunk;

        const { sentences, remainder } = this.extractSentences(buffer);
        buffer = remainder;

        for (const sentence of sentences) {
          if (this.bargeInTriggered) break;

          const clean = this.sanitizeForSpeech(sentence);
          if (!clean) continue;

          log.debug('TTS ←', clean);

          if (!firstSentenceEnqueued) {
            firstSentenceEnqueued = true;
            this.state = { ...this.state, status: 'speaking' };
            this.notifyStateChange();
            if (!this.muted) {
              this.bargeIn?.startMonitoring(() => this.handleBargeIn());
            }
          }

          speechQueue.push(this.synthesis.enqueue(clean, lang));
        }
      }

      // Flush any remaining buffer as a final utterance
      if (!this.bargeInTriggered) {
        const remainingText = this.sanitizeForSpeech(buffer.trim());
        if (remainingText) {
          log.debug('TTS ←', remainingText);

          if (!firstSentenceEnqueued) {
            this.state = { ...this.state, status: 'speaking' };
            this.notifyStateChange();
            if (!this.muted) {
              this.bargeIn?.startMonitoring(() => this.handleBargeIn());
            }
          }

          speechQueue.push(this.synthesis.enqueue(remainingText, lang));
        }
      }

      // Wait for all queued speech to finish (resolves immediately if canceled)
      await Promise.all(speechQueue);
      this.bargeIn?.stopMonitoring();

      if (this.sessionActive) {
        this.resumeListening();
      }
    } catch (err) {
      // Cancel remaining queued utterances on error
      this.bargeIn?.stopMonitoring();
      this.synthesis.cancel();

      if (this.sessionActive) {
        this.setError(err instanceof Error ? err.message : 'Conversation error');
        this.resumeListening();
      }
    }
  }

  /** Cancel speech and resume listening when user speaks during TTS playback. */
  private handleBargeIn(): void {
    if (!this.sessionActive || this.bargeInTriggered) return;

    log.info('Barge-in detected, canceling speech');
    this.bargeInTriggered = true;
    this.synthesis.cancel();
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
    this.state = { ...this.state, status: 'listening' };
    this.notifyStateChange();
    if (!this.muted) {
      this.recognition.resume();
    }
  }

  private async reinitAI(lang: SupportedLang): Promise<void> {
    try {
      this.ai.destroy();
      const pageText = this.pageExtractor.extractText();
      await this.ai.init(pageText, lang);
    } catch (err) {
      this.setError(err instanceof Error ? err.message : 'Failed to switch language');
    }
  }

  private setError(message: string): void {
    this.state = { ...this.state, status: 'error', error: message };
    this.notifyStateChange();

    // Auto-dismiss error after 3 seconds, but only resume listening if session is active
    setTimeout(() => {
      if (this.state.status === 'error' && this.sessionActive) {
        this.state = { ...this.state, status: 'listening', error: null };
        this.notifyStateChange();

        // Restart recognition in case it died from a fatal error
        if (!this.muted) {
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
  }
}
