import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { VoiceEngine, SessionTimer } from '@ariontalk/core';
import type { SupportedLang, VoiceSettings, VoiceEngineState, VoiceEngineInterface, VoiceInfo, EngineCapabilities } from '@ariontalk/core';

export class VoiceSessionController implements ReactiveController {
  private host: ReactiveControllerHost;
  private engine: VoiceEngineInterface;

  get state(): VoiceEngineState {
    return this.engine.state;
  }

  get timerDisplay(): string {
    return SessionTimer.format(this.engine.state.elapsedSeconds);
  }

  constructor(host: ReactiveControllerHost) {
    this.host = host;
    host.addController(this);

    this.engine = new VoiceEngine();
    this.engine.onStateChange = () => {
      this.host.requestUpdate();
    };
  }

  get capabilities(): EngineCapabilities {
    return this.engine.capabilities;
  }

  async setEngine(type: 'local' | 'gemini', config?: any): Promise<void> {
    this.engine.destroy();
    if (type === 'gemini') {
      const { GeminiEngine } = await import('@ariontalk/engine-gemini');
      this.engine = new GeminiEngine({
        tokenServerUrl: config.tokenServer,
        model: config.model,
        voice: config.voice,
      });
    } else {
      this.engine = new VoiceEngine({
        bargeInDetector: config?.bargeInDetector,
      });
    }
    this.engine.onStateChange = () => {
      this.host.requestUpdate();
    };
  }

  hostConnected() {}
  hostDisconnected() {
    this.engine.destroy();
  }

  startSession(lang: SupportedLang): Promise<void> {
    return this.engine.startSession(lang);
  }

  endSession(): void {
    this.engine.endSession();
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
}
