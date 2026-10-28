import type { SupportedLang, SpeechSynthesizer, SpeechSynthesizerOptions, VoiceInfo, VoiceSettings } from '@ariontalk/core';

interface SynthesisVoiceOverrides {
  voiceId: string | null;
  voice: SpeechSynthesisVoice | null;
  rate: number;
  pitch: number;
  volume: number;
}

const LANG_MAP: Record<string, string> = {
  en: 'en',
  es: 'es',
};

/**
 * Wraps the Speech Synthesis API with language-aware voice selection.
 * Prefers local voices for offline capability.
 */
export class SpeechSynthesisService implements SpeechSynthesizer {
  readonly id = 'system';
  readonly isReady = true;

  private voiceCache: Map<string, SpeechSynthesisVoice> = new Map();
  private activeUtterances = new Set<SpeechSynthesisUtterance>();
  private pendingResolves = new Set<() => void>();
  private overrides: SynthesisVoiceOverrides | null = null;

  onVoicesChanged: (() => void) | null = null;

  constructor() {
    this.loadVoices();
    // Voices may load asynchronously
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.onvoiceschanged = () => this.loadVoices();
    }
  }

  async init(_onProgress?: (loaded: number) => void): Promise<void> {
    // No-op for browser speech synthesis; voices are loaded via constructor/events
  }

  supportsLang(_lang: SupportedLang): boolean {
    return true;
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
      utterance.lang = LANG_MAP[lang] ?? lang;

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
      this.pendingResolves.add(resolve);

      utterance.onend = () => {
        this.activeUtterances.delete(utterance);
        this.pendingResolves.delete(resolve);
        resolve();
      };

      utterance.onerror = (event) => {
        this.activeUtterances.delete(utterance);
        this.pendingResolves.delete(resolve);
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
  enqueue(text: string, lang: SupportedLang, opts?: SpeechSynthesizerOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!window.speechSynthesis) {
        reject(new Error('Speech synthesis not supported'));
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = LANG_MAP[lang] ?? lang;

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
      this.pendingResolves.add(resolve);

      utterance.onstart = () => {
        opts?.onStart?.();
      };

      utterance.onboundary = (event) => {
        if (event.name === 'word') {
          opts?.onBoundary?.(event.charIndex);
        }
      };

      utterance.onend = () => {
        this.activeUtterances.delete(utterance);
        this.pendingResolves.delete(resolve);
        resolve();
      };

      utterance.onerror = (event) => {
        this.activeUtterances.delete(utterance);
        this.pendingResolves.delete(resolve);
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
    if (typeof speechSynthesis !== 'undefined' && window.speechSynthesis) {
      speechSynthesis.cancel();
    }
    // Resolve all pending promises — browser only fires onerror on the
    // currently speaking utterance; queued ones are silently dropped.
    // Double-resolve is safe (JS promises ignore subsequent resolve calls).
    for (const resolve of this.pendingResolves) {
      resolve();
    }
    this.pendingResolves.clear();
    this.activeUtterances.clear();
  }

  /** Returns available voices for a given language. */
  getAvailableVoices(lang: SupportedLang): SpeechSynthesisVoice[] {
    if (typeof speechSynthesis === 'undefined' || !window.speechSynthesis) return [];
    const prefix = LANG_MAP[lang] ?? lang;
    return speechSynthesis.getVoices().filter((v) => v.lang.startsWith(prefix));
  }

  getVoices(): VoiceInfo[] {
    if (typeof speechSynthesis === 'undefined' || !window.speechSynthesis) return [];
    return speechSynthesis.getVoices().map((v) => ({
      id: v.voiceURI,
      name: v.name,
      lang: v.lang,
      local: v.localService,
    }));
  }

  applyVoiceSettings(settings: VoiceSettings): void {
    let voice: SpeechSynthesisVoice | null = null;
    if (settings.voiceId && typeof speechSynthesis !== 'undefined' && window.speechSynthesis) {
      voice = speechSynthesis.getVoices().find((v) => v.voiceURI === settings.voiceId) ?? null;
    }
    this.overrides = {
      voiceId: settings.voiceId,
      voice,
      rate: settings.rate,
      pitch: settings.pitch,
      volume: settings.volume,
    };
  }

  getVoiceOverrides(): VoiceSettings | null {
    if (!this.overrides) return null;
    return {
      voiceId: this.overrides.voice?.voiceURI ?? this.overrides.voiceId ?? null,
      rate: this.overrides.rate,
      pitch: this.overrides.pitch,
      volume: this.overrides.volume,
    };
  }

  getAllVoices(): SpeechSynthesisVoice[] {
    if (typeof speechSynthesis === 'undefined' || !window.speechSynthesis) return [];
    return speechSynthesis.getVoices();
  }

  destroy(): void {
    this.cancel();
    if (typeof speechSynthesis !== 'undefined' && window.speechSynthesis) {
      speechSynthesis.onvoiceschanged = null;
    }
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
    if (typeof speechSynthesis !== 'undefined' && window.speechSynthesis) {
      speechSynthesis.getVoices();
    }
    this.onVoicesChanged?.();
  }
}
