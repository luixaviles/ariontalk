import type { SupportedLang } from '@ariontalk/core';
import { createLogger } from '@ariontalk/core';

const log = createLogger('speech-recognition');

export type SpeechLocalMode = 'prefer' | 'require' | 'off';
export type SpeechLocalStatus = 'on-device' | 'cloud' | 'downloading' | 'unavailable';

const PROBE_TIMEOUT_MS = 2000;
const INSTALL_TIMEOUT_MS = 120_000;

const LANG_MAP: Record<string, string> = {
  en: 'en-US',
  es: 'es-ES',
};

export function resolveRecognitionLang(lang: SupportedLang): string {
  if (lang === 'auto') return typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US';
  return LANG_MAP[lang] ?? lang;
}

function resolveCtor(): any {
  if (typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (res) => {
        clearTimeout(timer);
        resolve(res);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Wraps the Web Speech API's SpeechRecognition for continuous voice input.
 */
export class SpeechRecognitionService {
  private recognition: any = null;
  private active = false;
  private paused = false;
  private currentLang: SupportedLang = 'en';
  private localMode: SpeechLocalMode = 'off';
  private _localStatus: SpeechLocalStatus = 'cloud';
  private localUnavailableFor: string | null = null;
  private probing = false;
  private fatalError = false;
  private consecutiveAborts = 0;
  private generation = 0;
  private static readonly MAX_CONSECUTIVE_ABORTS = 3;
  private static readonly RESTART_BASE_DELAY_MS = 300;

  onInterimResult: ((text: string) => void) | null = null;
  onFinalResult: ((text: string) => void) | null = null;
  onError: ((error: string) => void) | null = null;
  onLocalStatusChange: ((status: SpeechLocalStatus) => void) | null = null;

  setLocalMode(mode: SpeechLocalMode): void {
    if (this.localMode !== mode) {
      this.localMode = mode;
      this.localUnavailableFor = null;
    }
  }

  get localStatus(): SpeechLocalStatus {
    return this._localStatus;
  }

  private setLocalStatus(status: SpeechLocalStatus): void {
    this._localStatus = status;
    this.onLocalStatusChange?.(status);
  }

  start(lang: SupportedLang): void {
    this.currentLang = lang;
    this.active = true;
    this.paused = false;
    this.fatalError = false;
    this.consecutiveAborts = 0;
    this.generation++;

    const gen = this.generation;
    const resolvedLang = resolveRecognitionLang(lang);

    if (this.localMode === 'require' && this.localUnavailableFor === resolvedLang) {
      this.setLocalStatus('unavailable');
      this.onError?.('speech-local-unavailable');
      return;
    }

    if (this.localMode === 'off') {
      this.setLocalStatus('cloud');
      this.createAndStart();
      return;
    }

    const Ctor = resolveCtor();
    if (!Ctor || typeof Ctor.available !== 'function') {
      if (this.localMode === 'require') {
        this.localUnavailableFor = resolvedLang;
        this.setLocalStatus('unavailable');
        this.onError?.('speech-local-unavailable');
        return;
      }
      this.setLocalStatus('cloud');
      this.createAndStart();
      return;
    }

    this.probing = true;
    void (async () => {
      let shouldStart = false;
      try {
        const status = await this.probeLocal(lang);
        if (gen !== this.generation || !this.active) return;

        const langs = [resolvedLang];

        if (this.localMode === 'require') {
          let ok = status === 'on-device';
          if (status === 'downloading') {
            this.setLocalStatus('downloading');
            ok = await this.runInstall(langs);
            if (gen !== this.generation || !this.active) return;
          }
          if (ok) {
            this.setLocalStatus('on-device');
            shouldStart = true;
          } else {
            this.localUnavailableFor = resolvedLang;
            this.setLocalStatus('unavailable');
            this.onError?.('speech-local-unavailable');
          }
        } else {
          if (status === 'downloading') void this.runInstall(langs);
          this.setLocalStatus(
            status === 'on-device' ? 'on-device'
            : status === 'downloading' ? 'downloading'
            : 'cloud',
          );
          shouldStart = true;
        }
      } finally {
        if (gen === this.generation) {
          this.probing = false;
          if (shouldStart && this.active && !this.paused && !this.recognition) {
            this.createAndStart();
          }
        }
      }
    })();
  }

  stop(): void {
    this.active = false;
    this.paused = false;
    this.fatalError = false;
    this.consecutiveAborts = 0;
    this.probing = false;
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
    // A latched 'require' failure leaves the session active with no recognizer,
    // which would otherwise look startable here and fall back to cloud.
    if (this.localMode === 'require' && this._localStatus === 'unavailable') return;
    if (this.active && !this.recognition && !this.probing) {
      this.createAndStart();
    } else if (this.active && this.recognition) {
      try { this.recognition.start(); } catch { /* already started */ }
    }
  }

  setLanguage(lang: SupportedLang): void {
    this.currentLang = lang;
    if (this.active) {
      this.stop();
      this.start(lang);
    }
  }

  private async probeLocal(lang: SupportedLang): Promise<SpeechLocalStatus> {
    const Ctor = resolveCtor();
    if (!Ctor || typeof Ctor.available !== 'function') return 'unavailable';

    const langs = [resolveRecognitionLang(lang)];
    let status: string;
    try {
      status = await withTimeout(Ctor.available({ langs, processLocally: true }), PROBE_TIMEOUT_MS);
    } catch (err) {
      log.warn('availability probe failed:', err);
      return 'unavailable';
    }

    if (status === 'available') return 'on-device';
    if (status === 'unavailable') return 'unavailable';

    // 'downloadable' or 'downloading'
    return 'downloading';
  }

  private async runInstall(langs: string[]): Promise<boolean> {
    const Ctor = resolveCtor();
    if (!Ctor || typeof Ctor.install !== 'function') return false;
    const gen = this.generation;
    try {
      const ok = await withTimeout(Ctor.install({ langs, processLocally: true }), INSTALL_TIMEOUT_MS);
      if (gen !== this.generation) return false;
      if (ok) this.setLocalStatus('on-device');
      return ok;
    } catch {
      if (gen === this.generation) {
        this.setLocalStatus(this.localMode === 'require' ? 'unavailable' : 'cloud');
      }
      return false;
    }
  }

  private createAndStart(): void {
    const SpeechRecognitionCtor = resolveCtor();

    if (!SpeechRecognitionCtor) {
      this.onError?.('SpeechRecognition not supported');
      return;
    }

    const rec = new SpeechRecognitionCtor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = resolveRecognitionLang(this.currentLang);

    if (this.localStatus === 'on-device') {
      // The upstream probe check ensures availability on this platform.
      rec.processLocally = true;
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
      log.warn('error:', error);

      if (error === 'no-speech') return;

      if (error === 'aborted') {
        this.consecutiveAborts++;
        if (this.consecutiveAborts >= SpeechRecognitionService.MAX_CONSECUTIVE_ABORTS) {
          log.warn('aborted repeatedly, stopping restarts');
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

      // Only log unexpected endings (active but not paused = unplanned restart)
      if (this.active && !this.paused) {
        log.debug('ended unexpectedly, fatalError:', this.fatalError);
      }
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
      log.info('started, lang:', rec.lang, 'localStatus:', this.localStatus);
    } catch (err) {
      log.warn('start failed:', err);
    }
  }
}
