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
  private currentLang: SupportedLang = 'en';

  onInterimResult: ((text: string) => void) | null = null;
  onFinalResult: ((text: string) => void) | null = null;
  onError: ((error: string) => void) | null = null;

  start(lang: SupportedLang): void {
    this.currentLang = lang;
    this.active = true;
    this.createAndStart();
  }

  stop(): void {
    this.active = false;
    if (this.recognition) {
      try { this.recognition.abort(); } catch { /* ignore */ }
      this.recognition = null;
    }
  }

  pause(): void {
    if (this.recognition) {
      try { this.recognition.stop(); } catch { /* ignore */ }
    }
  }

  resume(): void {
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

    // Attempt on-device processing
    try { (rec as any).processLocally = true; } catch { /* not supported */ }

    rec.onresult = (event: any) => {
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

    rec.onerror = (event: any) => {
      const error = event.error as string;
      // 'no-speech' and 'aborted' are expected during normal use
      if (error === 'no-speech' || error === 'aborted') return;
      this.onError?.(error);
    };

    rec.onend = () => {
      // Auto-restart if session is still active (handles unexpected disconnects)
      if (this.active) {
        try { rec.start(); } catch {
          // If restart fails, create a fresh instance
          setTimeout(() => {
            if (this.active) this.createAndStart();
          }, 300);
        }
      }
    };

    this.recognition = rec;
    try { rec.start(); } catch { /* ignore double-start */ }
  }
}
