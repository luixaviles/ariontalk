import type { ReactiveController, ReactiveControllerHost } from 'lit';
import type { VoiceSessionState, SupportedLang, VoiceSettings } from '../types.js';
import { PageExtractorService } from '../services/page-extractor.js';
import { SpeechRecognitionService } from '../services/speech-recognition.js';
import { SpeechSynthesisService } from '../services/speech-synthesis.js';
import { AISessionService } from '../services/ai-session.js';
import { SessionTimer } from '../utils/timer.js';

/**
 * Lit ReactiveController that orchestrates the full voice conversation loop:
 * page extraction → AI session → speech recognition ↔ AI ↔ speech synthesis
 */
export class VoiceSessionController implements ReactiveController {
  private host: ReactiveControllerHost;

  // Services
  private pageExtractor = new PageExtractorService();
  private recognition = new SpeechRecognitionService();
  private synthesis = new SpeechSynthesisService();
  private ai = new AISessionService();
  private timer: SessionTimer;

  // Whether a session is active (controls auto-restart / error recovery behavior)
  private sessionActive = false;

  // State
  state: VoiceSessionState = {
    status: 'idle',
    currentLang: 'en',
    elapsedSeconds: 0,
    interimTranscript: '',
    error: null,
    downloadProgress: 0,
  };

  get timerDisplay(): string {
    return this.timer.formatted;
  }

  constructor(host: ReactiveControllerHost) {
    this.host = host;
    host.addController(this);

    this.timer = new SessionTimer((seconds) => {
      this.state = { ...this.state, elapsedSeconds: seconds };
      this.host.requestUpdate();
    });

    // Wire recognition callbacks
    this.recognition.onInterimResult = (text) => {
      // console.log('[ariontalk] interim:', text);
      this.state = { ...this.state, interimTranscript: text };
      this.host.requestUpdate();
    };

    this.recognition.onFinalResult = (text) => {
      console.log('[ariontalk] final transcript:', text);
      this.handleFinalTranscript(text);
    };

    this.recognition.onError = (error) => {
      this.setError(error);
    };
  }

  hostConnected() {}
  hostDisconnected() {
    this.endSession();
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
    this.host.requestUpdate();

    // Start listening + timer immediately (don't block on AI init)
    try {
      this.recognition.start(lang);
    } catch (err) {
      console.warn('[ariontalk] Speech recognition unavailable:', err);
    }
    this.timer.start();

    // Check availability, then init AI with monitor only when download is needed
    const pageText = this.pageExtractor.extractText();
    try {
      const availability = await AISessionService.checkAvailability();
      if (!this.sessionActive) return;

      const needsDownload = availability === 'downloadable' || availability === 'downloading';

      if (needsDownload) {
        this.state = { ...this.state, status: 'loading' };
        this.host.requestUpdate();
      }

      const onProgress = needsDownload
        ? (loaded: number) => {
            this.state = {
              ...this.state,
              downloadProgress: loaded >= 1 ? -1 : loaded,
            };
            this.host.requestUpdate();
          }
        : undefined;

      await this.ai.init(pageText, lang, onProgress);

      if (this.state.status === 'loading' && this.sessionActive) {
        this.state = { ...this.state, status: 'listening', downloadProgress: 0 };
        this.host.requestUpdate();
      }
    } catch (err) {
      console.warn('[ariontalk] AI unavailable:', err);
    }
  }

  /** End the current session and clean up all services. */
  endSession(): void {
    this.sessionActive = false;
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
    this.host.requestUpdate();
  }

  applyVoiceSettings(settings: VoiceSettings): void {
    this.synthesis.setVoiceOverrides(settings);
  }

  getVoiceOverrides(): VoiceSettings | null {
    return this.synthesis.getVoiceOverrides();
  }

  getAllVoices(): SpeechSynthesisVoice[] {
    return this.synthesis.getAllVoices();
  }

  /** Switch recognition + synthesis + AI language mid-session. */
  switchLanguage(lang: SupportedLang): void {
    this.state = { ...this.state, currentLang: lang };
    this.host.requestUpdate();

    this.recognition.setLanguage(lang);

    // Re-initialize AI with new language preference
    this.reinitAI(lang);
  }

  /** Handle a finalized transcript from speech recognition. */
  private async handleFinalTranscript(text: string): Promise<void> {
    if (!text.trim()) return;

    if (!this.ai.isReady) {
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
    this.host.requestUpdate();

    // Clear any prior speech before streaming new response
    this.synthesis.cancel();

    const speechQueue: Promise<void>[] = [];
    const lang = this.state.currentLang;

    try {
      let buffer = '';
      let firstSentenceEnqueued = false;

      for await (const chunk of this.ai.prompt(text)) {
        buffer += chunk;

        const { sentences, remainder } = this.extractSentences(buffer);
        buffer = remainder;

        for (const sentence of sentences) {
          const clean = this.sanitizeForSpeech(sentence);
          if (!clean) continue;

          console.log('[ariontalk] Streaming sentence to TTS:', clean);

          if (!firstSentenceEnqueued) {
            firstSentenceEnqueued = true;
            this.state = { ...this.state, status: 'speaking' };
            this.host.requestUpdate();
          }

          speechQueue.push(this.synthesis.enqueue(clean, lang));
        }
      }

      // Flush any remaining buffer as a final utterance
      const remainingText = this.sanitizeForSpeech(buffer.trim());
      if (remainingText) {
        console.log('[ariontalk] Streaming sentence to TTS:', remainingText);

        if (!firstSentenceEnqueued) {
          this.state = { ...this.state, status: 'speaking' };
          this.host.requestUpdate();
        }

        speechQueue.push(this.synthesis.enqueue(remainingText, lang));
      }

      // Wait for all queued speech to finish
      await Promise.all(speechQueue);

      if (this.sessionActive) {
        this.resumeListening();
      }
    } catch (err) {
      // Cancel remaining queued utterances on error
      this.synthesis.cancel();

      if (this.sessionActive) {
        this.setError(err instanceof Error ? err.message : 'Conversation error');
        this.resumeListening();
      }
    }
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
    this.host.requestUpdate();
    this.recognition.resume();
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
    this.host.requestUpdate();

    // Auto-dismiss error after 3 seconds, but only resume listening if session is active
    setTimeout(() => {
      if (this.state.status === 'error' && this.sessionActive) {
        this.state = { ...this.state, status: 'listening', error: null };
        this.host.requestUpdate();

        // Restart recognition in case it died from a fatal error
        try {
          this.recognition.stop();
          this.recognition.start(this.state.currentLang);
        } catch { /* ignore */ }
      }
    }, 3000);
  }

  /** Clean up AI output for speech synthesis: strip markdown, emojis, truncate. */
  private sanitizeForSpeech(text: string): string {
    let clean = text
      // Remove emojis
      .replace(/\p{Extended_Pictographic}/gu, '')
      // Remove markdown bold/italic
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
      // Remove markdown headers
      .replace(/^#{1,6}\s+/gm, '')
      // Remove bullet points and list markers
      .replace(/^[\s]*[-*]\s+/gm, '')
      .replace(/^[\s]*\d+\.\s+/gm, '')
      // Collapse multiple newlines/whitespace into single space
      .replace(/\n+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    // Remove trailing filler questions like "Let me know if..." / "Does that help?"
    // clean = clean.replace(/\s*(Let me know|Does that|Is there anything|Do you want|Would you like|Feel free)[^.!?]*[.!?]?\s*$/i, '');

    return clean;
  }
}
