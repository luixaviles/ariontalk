import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { VoiceEngine } from '@ariontalk/core';
import type { SupportedLang, VoiceSettings, VoiceEngineState } from '@ariontalk/core';

export class VoiceSessionController implements ReactiveController {
  private host: ReactiveControllerHost;
  private engine: VoiceEngine;

  get state(): VoiceEngineState {
    return this.engine.state;
  }

  get timerDisplay(): string {
    return this.engine.timerDisplay;
  }

  constructor(host: ReactiveControllerHost) {
    this.host = host;
    host.addController(this);

    this.engine = new VoiceEngine();
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

  switchLanguage(lang: SupportedLang): void {
    this.engine.switchLanguage(lang);
  }

  applyVoiceSettings(settings: VoiceSettings): void {
    this.engine.applyVoiceSettings(settings);
  }

  getVoiceOverrides(): VoiceSettings | null {
    return this.engine.getVoiceOverrides();
  }

  getAllVoices(): SpeechSynthesisVoice[] {
    return this.engine.getAllVoices();
  }
}
