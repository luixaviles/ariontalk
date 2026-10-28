import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { SessionTimer } from '@ariontalk/core/utils';
import type { SupportedLang, VoiceSettings, VoiceEngineState, VoiceEngineInterface, VoiceInfo, EngineCapabilities } from '@ariontalk/core';
import type { VoiceEngineOptions } from '@ariontalk/engine-local';
import type { GeminiEngineOptions } from '@ariontalk/engine-gemini';
import { NullEngine } from './null-engine.js';

type EngineType = 'local' | 'gemini';

interface PendingEngineConfig {
  type: EngineType;
  config?: GeminiEngineOptions | VoiceEngineOptions;
}

export class VoiceSessionController implements ReactiveController {
  private host: ReactiveControllerHost;
  private engine: VoiceEngineInterface;
  private pendingConfig: PendingEngineConfig = { type: 'local' };
  private activeConfig: PendingEngineConfig | null = null;
  private ensurePromise: Promise<void> | null = null;
  private disposed = false;
  private customError: string | null = null;
  private hostEnding = false;
  private lastStatus: VoiceEngineState['status'] = 'idle';
  private lastError: string | null = null;

  get state(): VoiceEngineState {
    if (this.customError !== null) {
      return {
        ...this.engine.state,
        status: 'error',
        error: this.customError,
      };
    }
    return this.engine.state;
  }

  setError(message: string | null): void {
    this.customError = message;
    this.host.requestUpdate();
  }

  get timerDisplay(): string {
    return SessionTimer.format(this.engine.state.elapsedSeconds);
  }

  get isReady(): boolean {
    return !(this.engine instanceof NullEngine);
  }

  constructor(host: ReactiveControllerHost) {
    this.host = host;
    host.addController(this);
    this.engine = new NullEngine();
  }

  get capabilities(): EngineCapabilities {
    return this.engine.capabilities;
  }

  async setEngine(type: 'gemini', config: GeminiEngineOptions): Promise<void>;
  async setEngine(type: 'local', config?: VoiceEngineOptions): Promise<void>;
  async setEngine(
    type: 'local' | 'gemini',
    config?: GeminiEngineOptions | VoiceEngineOptions,
  ): Promise<void> {
    this.pendingConfig = { type, config };
  }

  /**
   * Loads the configured engine on demand.
   * Idempotent: returns immediately if the current pending config is already active.
   * Concurrent calls share one in-flight load promise.
   * Re-enters if pendingConfig moves while load is running.
   */
  ensureEngine(): Promise<void> {
    if (this.disposed) {
      return Promise.resolve();
    }

    if (this.isReady && this.activeConfig === this.pendingConfig) {
      return Promise.resolve();
    }

    if (this.ensurePromise) {
      return this.ensurePromise;
    }

    const p = (async () => {
      try {
        while (!(this.isReady && this.activeConfig === this.pendingConfig)) {
          if (this.disposed) return;
          await this.loadEngine(this.pendingConfig);
        }
      } finally {
        this.ensurePromise = null;
      }
    })();

    this.ensurePromise = p;
    return p;
  }

  private async loadEngine(target: PendingEngineConfig): Promise<void> {
    let newEngine: VoiceEngineInterface;

    if (target.type === 'gemini') {
      const { GeminiEngine } = await import('@ariontalk/engine-gemini');
      newEngine = new GeminiEngine(target.config as GeminiEngineOptions);
    } else {
      const { VoiceEngine } = await import('@ariontalk/engine-local');
      newEngine = new VoiceEngine(target.config as VoiceEngineOptions | undefined);
    }

    if (this.disposed) {
      newEngine.destroy();
      return;
    }

    this.activeConfig = target;
    this.attachEngine(newEngine);
  }

  private attachEngine(engine: VoiceEngineInterface): void {
    this.engine.destroy();
    this.engine = engine;
    this.lastStatus = this.engine.state.status;
    this.lastError = this.engine.state.error ?? null;
    this.engine.onStateChange = (state?: VoiceEngineState) => {
      const nextState = state ?? this.engine.state;
      if (this.lastStatus === 'error' && Boolean(this.lastError) && nextState.status === 'idle' && !this.hostEnding) {
        this.customError = this.lastError;
      }
      this.lastStatus = nextState.status;
      this.lastError = nextState.error ?? null;
      this.host.requestUpdate();
    };
    this.host.requestUpdate();
  }

  hostConnected() {
    this.disposed = false;
  }

  hostDisconnected() {
    this.destroy();
  }

  destroy(): void {
    this.disposed = true;
    this.engine.destroy();
  }

  startSession(lang: SupportedLang, options?: { greetingLang?: string; initialElapsedSeconds?: number }): Promise<void> {
    this.customError = null;
    return this.engine.startSession(lang, options);
  }

  endSession(): void {
    this.customError = null;
    this.hostEnding = true;
    try {
      this.engine.endSession();
    } finally {
      this.hostEnding = false;
    }
  }

  setMuted(muted: boolean): void {
    this.engine.setMuted(muted);
  }

  switchLanguage(lang: SupportedLang): void {
    this.engine.switchLanguage(lang);
  }

  applyVoiceSettings(settings: VoiceSettings): void {
    this.engine.applyVoiceSettings(settings);
  }

  getVoiceOverrides(): VoiceSettings | null {
    return this.engine.getVoiceOverrides();
  }

  getVoices(): VoiceInfo[] {
    return this.engine.getVoices();
  }

  getAudioLevels(): { input: number; output: number | null } | null {
    return this.engine.getAudioLevels?.() ?? null;
  }
}
