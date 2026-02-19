import type { SupportedLang, VoiceSettings } from '../types.js';

const LANG_MAP: Record<SupportedLang, string> = {
  en: 'en',
  es: 'es',
};

/**
 * Wraps the Speech Synthesis API with language-aware voice selection.
 * Prefers local voices for offline capability.
 */
export class SpeechSynthesisService {
  private voiceCache: Map<string, SpeechSynthesisVoice> = new Map();
  private activeUtterances = new Set<SpeechSynthesisUtterance>();
  private overrides: VoiceSettings | null = null;

  constructor() {
    this.loadVoices();
    // Voices may load asynchronously
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.onvoiceschanged = () => this.loadVoices();
    }
  }

  /** Speaks text and resolves when finished. Cancels any ongoing speech first. */
  speak(text: string, lang: SupportedLang): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!window.speechSynthesis) {
        reject(new Error('Speech synthesis not supported'));
        return;
      }

      // Cancel any ongoing speech first
      this.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = LANG_MAP[lang];

      if (this.overrides?.voice) {
        const match = speechSynthesis.getVoices().find(
          v => v.voiceURI === this.overrides!.voice!.voiceURI
        );
        if (match) utterance.voice = match;
      } else {
        const voice = this.getVoiceForLang(lang);
        if (voice) utterance.voice = voice;
      }
      utterance.rate = this.overrides?.rate ?? 1.0;
      utterance.pitch = this.overrides?.pitch ?? 1.0;
      utterance.volume = this.overrides?.volume ?? 1.0;

      this.activeUtterances.add(utterance);

      utterance.onend = () => {
        this.activeUtterances.delete(utterance);
        resolve();
      };

      utterance.onerror = (event) => {
        this.activeUtterances.delete(utterance);
        if (event.error === 'canceled' || event.error === 'interrupted') {
          resolve();
        } else {
          reject(new Error(`Speech synthesis error: ${event.error}`));
        }
      };

      speechSynthesis.speak(utterance);
    });
  }

  /** Queues a single utterance without canceling prior speech. */
  enqueue(text: string, lang: SupportedLang): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!window.speechSynthesis) {
        reject(new Error('Speech synthesis not supported'));
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = LANG_MAP[lang];

      if (this.overrides?.voice) {
        const match = speechSynthesis.getVoices().find(
          v => v.voiceURI === this.overrides!.voice!.voiceURI
        );
        if (match) utterance.voice = match;
      } else {
        const voice = this.getVoiceForLang(lang);
        if (voice) utterance.voice = voice;
      }
      utterance.rate = this.overrides?.rate ?? 1.0;
      utterance.pitch = this.overrides?.pitch ?? 1.0;
      utterance.volume = this.overrides?.volume ?? 1.0;

      this.activeUtterances.add(utterance);

      utterance.onend = () => {
        this.activeUtterances.delete(utterance);
        resolve();
      };

      utterance.onerror = (event) => {
        this.activeUtterances.delete(utterance);
        if (event.error === 'canceled' || event.error === 'interrupted') {
          resolve();
        } else {
          reject(new Error(`Speech synthesis error: ${event.error}`));
        }
      };

      speechSynthesis.speak(utterance);
    });
  }

  /** Immediately cancels any ongoing speech. */
  cancel(): void {
    if (window.speechSynthesis) {
      speechSynthesis.cancel();
      this.activeUtterances.clear();
    }
  }

  /** Returns available voices for a given language. */
  getAvailableVoices(lang: SupportedLang): SpeechSynthesisVoice[] {
    if (!window.speechSynthesis) return [];
    const prefix = LANG_MAP[lang];
    return speechSynthesis.getVoices().filter((v) => v.lang.startsWith(prefix));
  }

  setVoiceOverrides(settings: VoiceSettings | null): void {
    this.overrides = settings;
  }

  getVoiceOverrides(): VoiceSettings | null {
    return this.overrides;
  }

  getAllVoices(): SpeechSynthesisVoice[] {
    if (!window.speechSynthesis) return [];
    return speechSynthesis.getVoices();
  }

  private getVoiceForLang(lang: SupportedLang): SpeechSynthesisVoice | null {
    const cached = this.voiceCache.get(lang);
    if (cached) return cached;

    const voices = this.getAvailableVoices(lang);
    if (voices.length === 0) return null;

    // Prefer local voices for offline use
    const local = voices.find((v) => v.localService);
    const selected = local || voices[0];

    this.voiceCache.set(lang, selected);
    return selected;
  }

  private loadVoices(): void {
    this.voiceCache.clear();
    // Pre-cache voices if available
    if (window.speechSynthesis) {
      speechSynthesis.getVoices();
    }
  }
}
