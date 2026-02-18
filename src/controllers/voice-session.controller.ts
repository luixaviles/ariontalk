import type { ReactiveController, ReactiveControllerHost } from 'lit';
import type { VoiceSessionState, SupportedLang } from '../types.js';
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
      this.state = { ...this.state, interimTranscript: text };
      this.host.requestUpdate();
    };

    this.recognition.onFinalResult = (text) => {
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
    };
    this.host.requestUpdate();

    // Start listening + timer immediately (don't block on AI init)
    try {
      this.recognition.start(lang);
    } catch (err) {
      console.warn('[voice-chat-widget] Speech recognition unavailable:', err);
    }
    this.timer.start();

    // Initialize AI session in the background
    const pageText = this.pageExtractor.extractText();
    this.ai.init(pageText, lang).catch((err) => {
      console.warn('[voice-chat-widget] AI unavailable:', err);
    });
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
    };
    this.host.requestUpdate();
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
      this.setError('AI model is still loading. Please try again shortly.');
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

    try {
      // Stream AI response
      let fullResponse = '';
      for await (const chunk of this.ai.prompt(text)) {
        fullResponse += chunk;
      }

      if (!fullResponse.trim()) {
        this.resumeListening();
        return;
      }

      // Speak the response
      this.state = { ...this.state, status: 'speaking' };
      this.host.requestUpdate();

      await this.synthesis.speak(fullResponse, this.state.currentLang);
      this.resumeListening();
    } catch (err) {
      this.setError(err instanceof Error ? err.message : 'Conversation error');
      this.resumeListening();
    }
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
      }
    }, 3000);
  }
}
