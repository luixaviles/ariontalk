import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ReactiveControllerHost } from 'lit';
import type {
  VoiceEngineInterface,
  VoiceEngineState,
  EngineCapabilities,
  VoiceSettings,
  VoiceInfo,
} from '@ariontalk/core';
import { VoiceSessionController } from '../voice-session.controller.js';
import '../../components/widget-root.js';

class FakeEngine implements VoiceEngineInterface {
  readonly capabilities: EngineCapabilities = {
    supportedLanguages: ['en'],
    supportsVoiceSelection: false,
    supportsRatePitchVolume: false,
    supportsBargeInPlugins: false,
    supportsTtsPlugins: false,
    alwaysCaptureMic: false,
    supportsOffline: false,
    maxSessionDurationSec: null,
    requiresTokenServer: false,
    supportsInteractiveHighlights: false,
  };

  state: VoiceEngineState = {
    status: 'idle',
    currentLang: 'en',
    elapsedSeconds: 0,
    interimTranscript: '',
    error: null,
    downloadProgress: 0,
  };

  onStateChange: ((state: VoiceEngineState) => void) | null = null;

  emitState(partial: Partial<VoiceEngineState>): void {
    this.state = { ...this.state, ...partial };
    this.onStateChange?.(this.state);
  }

  async startSession(): Promise<void> {
    this.emitState({ status: 'listening', error: null });
  }

  endSession(): void {
    this.emitState({ status: 'idle', error: null });
  }

  destroy(): void {}
  switchLanguage(): void {}
  setMuted(): void {}
  applyVoiceSettings(): void {}
  getVoiceOverrides(): VoiceSettings | null { return null; }
  getVoices(): VoiceInfo[] { return []; }
}

describe('VoiceSessionController terminal error handling', () => {
  let host: ReactiveControllerHost & { requestUpdate: ReturnType<typeof vi.fn> };
  let controller: VoiceSessionController;
  let fakeEngine: FakeEngine;

  beforeEach(() => {
    document.body.innerHTML = '';
    host = {
      addController: vi.fn(),
      removeController: vi.fn(),
      requestUpdate: vi.fn(),
      updateComplete: Promise.resolve(true),
    };
    controller = new VoiceSessionController(host);
    fakeEngine = new FakeEngine();
    (controller as any).attachEngine(fakeEngine);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('Engine emits error then idle on its own: controller.state is { status: "error", error: "Quota" }', () => {
    fakeEngine.emitState({ status: 'error', error: 'Quota' });
    fakeEngine.emitState({ status: 'idle', error: null });

    expect(controller.state.status).toBe('error');
    expect(controller.state.error).toBe('Quota');
  });

  it('Host calls controller.endSession() while the engine is in error: no message is kept (state.status === "idle")', () => {
    fakeEngine.emitState({ status: 'error', error: 'Quota' });
    controller.endSession();

    expect(controller.state.status).toBe('idle');
    expect(controller.state.error).toBeNull();
  });

  it('After keeping a message: setError(null) clears it, and startSession() clears it', async () => {
    fakeEngine.emitState({ status: 'error', error: 'Quota' });
    fakeEngine.emitState({ status: 'idle', error: null });
    expect(controller.state.error).toBe('Quota');

    controller.setError(null);
    expect(controller.state.status).toBe('idle');
    expect(controller.state.error).toBeNull();

    // Re-trigger terminal error to keep it again
    fakeEngine.emitState({ status: 'error', error: 'Quota' });
    fakeEngine.emitState({ status: 'idle', error: null });
    expect(controller.state.error).toBe('Quota');

    await controller.startSession('en');
    expect(controller.state.error).toBeNull();
    expect(controller.state.status).toBe('listening');
  });

  it('Engine goes listening -> idle (normal end): nothing is kept', () => {
    fakeEngine.emitState({ status: 'listening', error: null });
    fakeEngine.emitState({ status: 'idle', error: null });

    expect(controller.state.status).toBe('idle');
    expect(controller.state.error).toBeNull();
  });

  it('Root test: fake cloud engine calls onSessionEnd, then emits error, then idles in one tick; .fab-error note shows message', async () => {
    const el = document.createElement('ariontalk-widget') as any;
    el.setAttribute('force', '');
    el.setAttribute('engine', 'gemini');
    el.setAttribute('token-server', 'https://api.test/token');
    document.body.appendChild(el);
    await el.updateComplete;

    let onSessionEndCallback: any = null;
    const origSetEngine = el.controller.setEngine.bind(el.controller);
    vi.spyOn(el.controller, 'setEngine').mockImplementation(async (type: any, config: any) => {
      if (config?.onSessionEnd) {
        onSessionEndCallback = config.onSessionEnd;
      }
      return origSetEngine(type, config);
    });

    await el.initEngine();

    const rootEngine = new FakeEngine();
    (el.controller as any).attachEngine(rootEngine);
    el.active = true;
    await el.updateComplete;

    // Simulate in one tick: onSessionEnd, error, idle
    onSessionEndCallback?.({ duration: 5 });
    rootEngine.emitState({ status: 'error', error: 'API quota exceeded. Please check your plan or try again later.' });
    rootEngine.emitState({ status: 'idle', error: null });

    await el.updateComplete;

    expect(el.active).toBe(false);
    const alertEl = el.shadowRoot?.querySelector('.fab-error[role="alert"]');
    expect(alertEl).not.toBeNull();
    expect(alertEl?.querySelector('strong')?.textContent?.trim()).toBe("We couldn't start the assistant");
    expect(alertEl?.querySelector('span')?.textContent?.trim()).toBe('API quota exceeded. Please check your plan or try again later.');
  });
});
