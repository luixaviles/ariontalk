import type { SupportedLang } from '../types.js';

const LANG_MAP: Record<SupportedLang, string> = {
  en: 'en-US',
  es: 'es-ES',
};

/**
 * Wraps the Web Speech API's SpeechRecognition for continuous voice input.
 */
export class SpeechRecognitionService {
  private recognition: any = null;
  private active = false;
  private paused = false;
  private currentLang: SupportedLang = 'en';
  private useLocalProcessing = false;
  private fatalError = false;
  private consecutiveAborts = 0;
  private generation = 0;
  private static readonly MAX_CONSECUTIVE_ABORTS = 3;
  private static readonly RESTART_BASE_DELAY_MS = 300;

  onInterimResult: ((text: string) => void) | null = null;
  onFinalResult: ((text: string) => void) | null = null;
  onError: ((error: string) => void) | null = null;

  start(lang: SupportedLang): void {
    this.currentLang = lang;
    this.active = true;
    this.paused = false;
    this.fatalError = false;
    this.consecutiveAborts = 0;
    this.generation++;
    this.createAndStart();
  }

  stop(): void {
    this.active = false;
    this.paused = false;
    this.fatalError = false;
    this.consecutiveAborts = 0;
    this.generation++;
    if (this.recognition) {
      try { this.recognition.abort(); } catch { /* ignore */ }
      this.recognition = null;
    }
  }

  pause(): void {
    this.paused = true;
    if (this.recognition) {
      try { this.recognition.stop(); } catch { /* ignore */ }
    }
  }

  resume(): void {
    this.paused = false;
    if (this.active && !this.recognition) {
      this.createAndStart();
    } else if (this.active && this.recognition) {
      try { this.recognition.start(); } catch { /* already started */ }
    }
  }

  setLanguage(lang: SupportedLang): void {
    this.currentLang = lang;
    if (this.active) {
      this.stop();
      this.active = true;
      this.createAndStart();
    }
  }

  private createAndStart(): void {
    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      this.onError?.('SpeechRecognition not supported');
      return;
    }

    const rec = new SpeechRecognitionCtor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = LANG_MAP[this.currentLang];

    // Attempt on-device processing if not already failed
    if (this.useLocalProcessing) {
      try { (rec as any).processLocally = true; } catch { /* not supported */ }
    }

    rec.onresult = (event: any) => {
      this.consecutiveAborts = 0;
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          this.onFinalResult?.(transcript.trim());
        } else {
          interim += transcript;
        }
      }
      if (interim) {
        this.onInterimResult?.(interim);
      }
    };

    const gen = this.generation;

    rec.onerror = (event: any) => {
      if (gen !== this.generation) return;

      const error = event.error as string;
      console.log('[ariontalk] SpeechRecognition error:', error);

      if (error === 'no-speech') return;

      if (error === 'aborted') {
        this.consecutiveAborts++;
        if (this.consecutiveAborts >= SpeechRecognitionService.MAX_CONSECUTIVE_ABORTS) {
          console.warn('[ariontalk] SpeechRecognition aborted repeatedly, stopping restarts');
          this.fatalError = true;
          this.onError?.('speech-recognition-unavailable');
        }
        return;
      }

      // Fatal error — stop auto-restart
      this.fatalError = true;
      this.onError?.(error);
    };

    rec.onend = () => {
      if (gen !== this.generation) return;

      console.log('[ariontalk] SpeechRecognition ended, active:', this.active, 'paused:', this.paused, 'fatalError:', this.fatalError);
      // Auto-restart if session is still active, not paused, and no fatal error
      if (this.active && !this.paused && !this.fatalError) {
        const delay = SpeechRecognitionService.RESTART_BASE_DELAY_MS * Math.pow(2, this.consecutiveAborts);
        setTimeout(() => {
          if (gen !== this.generation) return;
          if (!this.active || this.paused || this.fatalError) return;
          this.createAndStart();
        }, delay);
      }
    };

    this.recognition = rec;
    try {
      rec.start();
      console.log('[ariontalk] SpeechRecognition started, lang:', rec.lang);
    } catch (err) {
      console.warn('[ariontalk] SpeechRecognition start failed:', err);
    }
  }
}
