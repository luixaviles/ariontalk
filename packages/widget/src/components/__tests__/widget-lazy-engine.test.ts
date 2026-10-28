import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../widget-root.js';
import { VoiceSessionController } from '../../controllers/voice-session.controller.js';
import { NullEngine } from '../../controllers/null-engine.js';

describe('widget lazy engine loading', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('no engine module is loaded on mount: controller.isReady is false and capabilities come from NullEngine', async () => {
    const el = document.createElement('ariontalk-widget') as any;
    el.setAttribute('engine', 'gemini');
    el.setAttribute('token-server', 'https://api.test/token');

    document.body.appendChild(el);
    await el.updateComplete;

    expect(el.controller.isReady).toBe(false);
    expect(el.controller.capabilities.supportsVoiceSelection).toBe(false);
    expect(el.controller.capabilities.alwaysCaptureMic).toBe(false);
    expect(el.controller.getVoices()).toEqual([]);
  });

  it('handleFabClick loads the engine before startSession is called and applies voice settings to real engine', async () => {
    const el = document.createElement('ariontalk-widget') as any;
    el.setAttribute('engine', 'local');
    document.body.appendChild(el);
    await el.updateComplete;

    expect(el.controller.isReady).toBe(false);

    let engineReadyBeforeStartSession = false;
    let applyVoiceSettingsCalledOnRealEngine = false;

    // Spy on ensureEngine to track transition
    const originalEnsureEngine = el.controller.ensureEngine.bind(el.controller);
    vi.spyOn(el.controller, 'ensureEngine').mockImplementation(async () => {
      await originalEnsureEngine();
      expect(el.controller.isReady).toBe(true);
    });

    vi.spyOn(el.controller, 'applyVoiceSettings').mockImplementation((settings: any) => {
      if (el.controller.isReady) {
        applyVoiceSettingsCalledOnRealEngine = true;
      }
    });

    vi.spyOn(el.controller, 'startSession').mockImplementation(async () => {
      engineReadyBeforeStartSession = el.controller.isReady;
    });

    // Simulate clicking FAB
    await el.handleFabClick();

    expect(el.controller.isReady).toBe(true);
    expect(engineReadyBeforeStartSession).toBe(true);
    expect(applyVoiceSettingsCalledOnRealEngine).toBe(true);
  });

  it('handleGearClick awaits the engine and imports the settings panel so it has real voices', async () => {
    const el = document.createElement('ariontalk-widget') as any;
    el.setAttribute('engine', 'local');
    document.body.appendChild(el);
    await el.updateComplete;

    const loadPanelSpy = vi.spyOn(el, 'loadSettingsPanel');
    expect(el.controller.isReady).toBe(false);
    expect(el.showSettings).toBe(false);

    await el.handleGearClick();

    expect(loadPanelSpy).toHaveBeenCalledTimes(1);
    expect(customElements.get('vcw-voice-settings')).toBeDefined();
    expect(el.showSettings).toBe(true);
    expect(el.controller.isReady).toBe(true);
    // Real local engine provides capabilities with supportsRatePitchVolume = true
    expect(el.controller.capabilities.supportsRatePitchVolume).toBe(true);
  });

  it('ensureEngine called twice concurrently loads once', async () => {
    const host = { requestUpdate: vi.fn(), addController: vi.fn() };
    const controller = new VoiceSessionController(host as any);

    expect(controller.isReady).toBe(false);

    // Call ensureEngine concurrently
    const p1 = controller.ensureEngine();
    const p2 = controller.ensureEngine();

    expect(p1).toBe(p2); // Shares the exact same promise instance

    await Promise.all([p1, p2]);

    expect(controller.isReady).toBe(true);
  });

  it('honors setEngine that lands while load is in flight', async () => {
    const host = { requestUpdate: vi.fn(), addController: vi.fn() };
    const controller = new VoiceSessionController(host as any);

    const sentinelDetector = { id: 'sentinel-detector', init: vi.fn(), reset: vi.fn() } as any;

    const p1 = controller.ensureEngine();
    await controller.setEngine('local', { bargeInDetector: sentinelDetector });
    const p2 = controller.ensureEngine();
    await Promise.all([p1, p2]);

    expect(controller.isReady).toBe(true);
    expect((controller as any).engine.bargeIn).toBe(sentinelDetector);
  });

  it('failing dynamic import rejects both waiters and does not loop', async () => {
    const host = { requestUpdate: vi.fn(), addController: vi.fn() };
    const controller = new VoiceSessionController(host as any);

    const loadError = new Error('Dynamic import network failure');
    vi.spyOn(controller as any, 'loadEngine').mockImplementation(async () => {
      throw loadError;
    });

    const p1 = controller.ensureEngine();
    const p2 = controller.ensureEngine();

    const [res1, res2] = await Promise.allSettled([p1, p2]);
    expect(res1.status).toBe('rejected');
    expect((res1 as PromiseRejectedResult).reason.message).toContain('Dynamic import network failure');
    expect(res2.status).toBe('rejected');
    expect((res2 as PromiseRejectedResult).reason.message).toContain('Dynamic import network failure');
  });

  it('failed load on FAB click leaves active false, sets visible error alert, and does not dispatch at-session-start', async () => {
    const el = document.createElement('ariontalk-widget') as any;
    el.setAttribute('force', '');
    el.setAttribute('engine', 'local');
    document.body.appendChild(el);
    await el.updateComplete;

    vi.spyOn(el.controller, 'ensureEngine').mockRejectedValue(new Error('Network offline'));
    let sessionStartedFired = false;
    el.addEventListener('at-session-start', () => {
      sessionStartedFired = true;
    });

    await el.handleFabClick();
    await el.updateComplete;

    expect(el.active).toBe(false);
    expect(sessionStartedFired).toBe(false);
    expect(el.controller.state.error).toBe('Failed to start session');

    const alertEl = el.shadowRoot?.querySelector('.fab-error[role="alert"]');
    expect(alertEl).not.toBeNull();
    expect(alertEl?.querySelector('strong')?.textContent?.trim()).toBe("We couldn't start the assistant");
    expect(alertEl?.querySelector('span')?.textContent?.trim()).toBe('Something went wrong while loading. Try again.');
    expect(alertEl?.querySelector('button.fab-error-retry')?.textContent?.trim()).toBe('Retry');
  });

  it('failed load on gear click still imports and opens settings panel', async () => {
    const el = document.createElement('ariontalk-widget') as any;
    el.setAttribute('engine', 'local');
    document.body.appendChild(el);
    await el.updateComplete;

    const loadPanelSpy = vi.spyOn(el, 'loadSettingsPanel');
    vi.spyOn(el.controller, 'ensureEngine').mockRejectedValue(new Error('Network offline'));

    await el.handleGearClick();
    await el.updateComplete;

    expect(loadPanelSpy).toHaveBeenCalledTimes(1);
    expect(customElements.get('vcw-voice-settings')).toBeDefined();
    expect(el.showSettings).toBe(true);
  });

  it('failed settings panel import on gear click logs warning and does not open settings panel', async () => {
    const el = document.createElement('ariontalk-widget') as any;
    el.setAttribute('engine', 'local');
    document.body.appendChild(el);
    await el.updateComplete;

    const chunkErr = new Error('Chunk load failed');
    vi.spyOn(el.controller, 'ensureEngine').mockResolvedValue(undefined);
    vi.spyOn(el, 'loadSettingsPanel').mockRejectedValue(chunkErr);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await el.handleGearClick();
    await el.updateComplete;

    expect(warnSpy).toHaveBeenCalledWith('[ariontalk] Failed to load settings panel:', chunkErr);
    expect(el.showSettings).toBe(false);
  });

  it('disconnecting host during load destroys the engine that finishes loading', async () => {
    const host = { requestUpdate: vi.fn(), addController: vi.fn() };
    const controller = new VoiceSessionController(host as any);

    const VoiceEngineModule = await import('@ariontalk/engine-local');
    const originalVoiceEngine = VoiceEngineModule.VoiceEngine;
    let createdEngine: any = null;

    vi.spyOn(VoiceEngineModule, 'VoiceEngine').mockImplementation((...args: any[]) => {
      createdEngine = new originalVoiceEngine(...args);
      vi.spyOn(createdEngine, 'destroy');
      return createdEngine;
    });

    const loadPromise = controller.ensureEngine();
    controller.destroy();

    await loadPromise;

    expect(createdEngine).not.toBeNull();
    expect(createdEngine.destroy).toHaveBeenCalled();
    expect(controller.isReady).toBe(false);
  });

  it('loads the engine again after the host is disconnected and re-attached', async () => {
    const host = { requestUpdate: vi.fn(), addController: vi.fn() };
    const controller = new VoiceSessionController(host as any);

    controller.hostDisconnected();
    await controller.ensureEngine();
    expect(controller.isReady).toBe(false);

    controller.hostConnected();
    await controller.ensureEngine();

    expect(controller.isReady).toBe(true);
  });

  it('NullEngine rejects startSession', async () => {
    const nullEngine = new NullEngine();
    await expect(nullEngine.startSession()).rejects.toThrow(/Cannot start session on NullEngine/);
  });
});
