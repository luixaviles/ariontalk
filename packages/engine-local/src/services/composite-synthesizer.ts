import type { SpeechSynthesizer, SpeechSynthesizerOptions, SupportedLang, VoiceInfo, VoiceSettings } from '@ariontalk/core';

/**
 * Wraps an always-present base synthesizer (Web Speech) and an optional plugin synthesizer (e.g. Kokoro TTS),
 * routing utterances dynamically based on readiness and language support.
 */
export class CompositeSynthesizer implements SpeechSynthesizer {
  readonly id = 'composite';
  private speaking: SpeechSynthesizer | null = null;

  constructor(
    private readonly base: SpeechSynthesizer,
    private readonly active: SpeechSynthesizer | null,
  ) {}

  get isReady(): boolean {
    return true; // base is always ready
  }

  async init(onProgress?: (loaded: number) => void): Promise<void> {
    await this.base.init();
    // Await plugin init so the greeting uses the selected voice.
    if (this.active) await this.active.init(onProgress);
  }

  /** Initializes only the always-present backend, for sessions no plugin will speak. */
  initBase(): Promise<void> {
    return this.base.init();
  }

  /** The backend that will speak `lang` given current readiness. */
  private pick(lang: SupportedLang): SpeechSynthesizer {
    if (this.active && this.active.isReady && this.active.supportsLang(lang)) return this.active;
    return this.base;
  }

  /** Whether the plugin backend is the one that would speak `lang` once loaded. */
  willUseActive(lang: SupportedLang): boolean {
    return !!this.active && this.active.supportsLang(lang);
  }

  supportsLang(_lang: SupportedLang): boolean {
    return true; // base handles any language
  }

  enqueue(text: string, lang: SupportedLang, opts?: SpeechSynthesizerOptions): Promise<void> {
    const backend = this.pick(lang);
    this.speaking = backend;
    return backend.enqueue(text, lang, opts);
  }

  cancel(): void {
    this.speaking = null;
    this.base.cancel();
    this.active?.cancel();
  }

  getVoices(): VoiceInfo[] {
    const baseVoices = this.base.getVoices();
    const activeVoices = this.active ? this.active.getVoices() : [];
    return [...baseVoices, ...activeVoices];
  }

  applyVoiceSettings(settings: VoiceSettings): void {
    this.base.applyVoiceSettings(settings);
    this.active?.applyVoiceSettings(settings);
  }

  getVoiceOverrides(): VoiceSettings | null {
    return (this.active?.isReady ? this.active : this.base).getVoiceOverrides();
  }

  getOutputLevel(): number | null {
    return this.speaking?.getOutputLevel?.() ?? null;
  }

  destroy(): void {
    this.speaking = null;
    this.base.destroy();
    this.active?.destroy();
  }
}
