import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../widget-root.js';
import type { TtsPlugin } from '../../types.js';

const LEGACY_KEY = 'ariontalk:settings';

function makeSettings(voiceId: string) {
  return {
    lang: 'en',
    voiceIds: { system: voiceId },
    ttsPluginId: 'system',
    rate: 1,
    pitch: 1,
    volume: 1,
    bargeInPluginId: 'off',
  };
}

function makeMockTtsPlugin(id: string, opts?: { status?: string; preloadReject?: boolean }): TtsPlugin & { preloadSpy: any } {
  const preloadSpy = vi.fn().mockImplementation(() => {
    if (opts?.preloadReject) {
      return Promise.reject(new Error('Download failed'));
    }
    return Promise.resolve();
  });
  return {
    id,
    label: id.toUpperCase(),
    voices: [{ id: `${id}_v1`, name: `${id} Voice`, lang: 'en-US', local: true }],
    supports: { rate: true, pitch: false, volume: true },
    create: () => ({ id } as any),
    preload: preloadSpy,
    status: () => (opts?.status ?? 'ready') as any,
    preloadSpy,
  };
}

/** Mount a widget and wait for its first update to settle. */
async function mount(attrs: Record<string, string>): Promise<any> {
  const el = document.createElement('ariontalk-widget') as any;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('per-engine settings storage & TTS plugin migration', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    // Engine construction reaches for browser APIs the jsdom env lacks.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the key for the active engine', async () => {
    localStorage.setItem('ariontalk:settings:local', JSON.stringify(makeSettings('Google US English')));

    const el = await mount({ engine: 'local' });

    expect(el.savedSettings?.voiceIds?.system).toBe('Google US English');
  });

  it('does not read another engine\'s settings', async () => {
    localStorage.setItem('ariontalk:settings:local', JSON.stringify(makeSettings('Google US English')));

    const el = await mount({ engine: 'gemini' });

    expect(el.savedSettings).toBeNull();
  });

  it('writes under the engine-scoped key', async () => {
    const el = await mount({ engine: 'gemini' });

    el.saveSettings(makeSettings('Kore'));

    expect(JSON.parse(localStorage.getItem('ariontalk:settings:gemini')!).voiceIds.system).toBe('Kore');
    expect(localStorage.getItem('ariontalk:settings:local')).toBeNull();
  });

  it('ignores the pre-namespacing key', async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(makeSettings('Google US English')));

    const el = await mount({ engine: 'gemini' });

    expect(el.savedSettings).toBeNull();
  });

  it('clears in-memory settings when switching to an engine with none stored', async () => {
    localStorage.setItem('ariontalk:settings:local', JSON.stringify(makeSettings('Google US English')));

    const el = await mount({ engine: 'local' });
    expect(el.savedSettings?.voiceIds?.system).toBe('Google US English');

    el.setAttribute('engine', 'gemini');
    await el.updateComplete;

    expect(el.savedSettings).toBeNull();
  });

  it('keeps each engine\'s settings independent', async () => {
    localStorage.setItem('ariontalk:settings:local', JSON.stringify(makeSettings('Google US English')));
    localStorage.setItem('ariontalk:settings:gemini', JSON.stringify(makeSettings('Kore')));

    const el = await mount({ engine: 'gemini' });
    expect(el.savedSettings?.voiceIds?.system).toBe('Kore');

    el.setAttribute('engine', 'local');
    await el.updateComplete;

    expect(el.savedSettings?.voiceIds?.system).toBe('Google US English');
  });

  it('1. Legacy stored settings with a flat voiceId migrate to voiceIds.system, and ttsPluginId defaults to system', async () => {
    const legacyBlob = { lang: 'en', voiceId: 'Legacy Voice', rate: 1, pitch: 1, volume: 1, bargeInPluginId: 'off' };
    localStorage.setItem('ariontalk:settings:local', JSON.stringify(legacyBlob));

    const el = await mount({ engine: 'local' });

    expect(el.savedSettings?.voiceIds?.system).toBe('Legacy Voice');
    expect(el.savedSettings?.voiceId).toBeUndefined();
    expect(el.savedSettings?.ttsPluginId).toBe('system');
  });

  it('2. Migration runs per engine key, so a legacy local blob does not leak into gemini', async () => {
    const legacyBlob = { lang: 'en', voiceId: 'Legacy Voice', rate: 1, pitch: 1, volume: 1, bargeInPluginId: 'off' };
    localStorage.setItem('ariontalk:settings:local', JSON.stringify(legacyBlob));

    const el = await mount({ engine: 'gemini' });

    expect(el.savedSettings).toBeNull();
  });

  it('3. A stored ttsPluginId naming an unregistered plugin reads back as system', async () => {
    const blob = { lang: 'en', ttsPluginId: 'custom-unregistered', voiceIds: { 'custom-unregistered': 'v1' }, rate: 1, pitch: 1, volume: 1, bargeInPluginId: 'off' };
    localStorage.setItem('ariontalk:settings:local', JSON.stringify(blob));

    const el = await mount({ engine: 'local' });

    expect(el.currentSettings.ttsPluginId).toBe('system');
  });

  it('4. Re-registering that plugin restores the stored preference', async () => {
    const blob = { lang: 'en', ttsPluginId: 'kokoro', voiceIds: { kokoro: 'af_heart' }, rate: 1, pitch: 1, volume: 1, bargeInPluginId: 'off' };
    localStorage.setItem('ariontalk:settings:local', JSON.stringify(blob));

    const el = await mount({ engine: 'local' });
    expect(el.currentSettings.ttsPluginId).toBe('system');

    const plugin = makeMockTtsPlugin('kokoro');
    el.ttsPlugins = [plugin];
    await el.updateComplete;

    expect(el.currentSettings.ttsPluginId).toBe('kokoro');
  });

  it('5. Applying settings with a new ttsPluginId calls that plugin\'s preload exactly once; re-applying when ready does not call it again', async () => {
    const el = await mount({ engine: 'local' });
    const plugin = makeMockTtsPlugin('kokoro');
    el.ttsPlugins = [plugin];

    // Apply with kokoro
    const newSettings = { lang: 'en', ttsPluginId: 'kokoro', voiceIds: { kokoro: 'af_heart' }, rate: 1, pitch: 1, volume: 1, bargeInPluginId: 'off' };
    el.handleSettingsApply(new CustomEvent('settings-apply', { detail: newSettings }));

    expect(plugin.preloadSpy).toHaveBeenCalledTimes(1);

    // Re-apply same plugin id when status is ready
    el.handleSettingsApply(new CustomEvent('settings-apply', { detail: newSettings }));
    expect(plugin.preloadSpy).toHaveBeenCalledTimes(1);
  });

  it('6. Mounting with stored settings that select a plugin does NOT call preload', async () => {
    const blob = { lang: 'en', ttsPluginId: 'kokoro', voiceIds: { kokoro: 'af_heart' }, rate: 1, pitch: 1, volume: 1, bargeInPluginId: 'off' };
    localStorage.setItem('ariontalk:settings:local', JSON.stringify(blob));

    const plugin = makeMockTtsPlugin('kokoro');
    const el = document.createElement('ariontalk-widget') as any;
    el.setAttribute('engine', 'local');
    el.ttsPlugins = [plugin];
    document.body.appendChild(el);
    await el.updateComplete;

    expect(plugin.preloadSpy).not.toHaveBeenCalled();
  });

  it('7. Re-applying the same id after status() reports failed DOES call preload again', async () => {
    const plugin = makeMockTtsPlugin('kokoro', { status: 'failed' });
    const el = await mount({ engine: 'local' });
    el.ttsPlugins = [plugin];

    const newSettings = { lang: 'en', ttsPluginId: 'kokoro', voiceIds: { kokoro: 'af_heart' }, rate: 1, pitch: 1, volume: 1, bargeInPluginId: 'off' };
    el.handleSettingsApply(new CustomEvent('settings-apply', { detail: newSettings }));
    expect(plugin.preloadSpy).toHaveBeenCalledTimes(1);

    // Re-apply again while status is failed
    el.handleSettingsApply(new CustomEvent('settings-apply', { detail: newSettings }));
    expect(plugin.preloadSpy).toHaveBeenCalledTimes(2);
  });

  it('8. A rejecting preload does not produce an unhandled rejection and does not throw out of handleSettingsApply', async () => {
    const plugin = makeMockTtsPlugin('kokoro', { preloadReject: true });
    const el = await mount({ engine: 'local' });
    el.ttsPlugins = [plugin];

    const newSettings = { lang: 'en', ttsPluginId: 'kokoro', voiceIds: { kokoro: 'af_heart' }, rate: 1, pitch: 1, volume: 1, bargeInPluginId: 'off' };

    expect(() => {
      el.handleSettingsApply(new CustomEvent('settings-apply', { detail: newSettings }));
    }).not.toThrow();
  });
});
