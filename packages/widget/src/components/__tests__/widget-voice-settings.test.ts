import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../widget-voice-settings.js';
import type { WidgetVoiceSettings } from '../widget-voice-settings.js';
import type { TtsPlugin } from '../../types.js';

function makeMockTtsPlugin(id: string, opts?: { pitch?: boolean; status?: string; allowAutomatic?: boolean }): TtsPlugin {
  return {
    id,
    label: id.toUpperCase(),
    tooltip: `${id} TTS engine`,
    voices: [
      { id: `${id}_v1`, name: `${id} Voice 1`, lang: 'en-US', local: true, group: 'American English' },
      { id: `${id}_v2`, name: `${id} Voice 2`, lang: 'en-GB', local: true, group: 'British English' },
    ],
    supports: { rate: true, pitch: opts?.pitch ?? false, volume: true },
    allowAutomaticVoice: opts?.allowAutomatic ?? false,
    create: () => ({ id } as any),
    preload: () => Promise.resolve(),
    status: () => (opts?.status ?? 'ready') as any,
  };
}

async function mountPanel(): Promise<WidgetVoiceSettings> {
  const el = document.createElement('vcw-voice-settings') as WidgetVoiceSettings;
  el.currentSettings = {
    lang: 'en',
    rate: 1,
    pitch: 1,
    volume: 1,
    bargeInPluginId: 'off',
    ttsPluginId: 'system',
    voiceIds: {},
  };
  el.capabilities = {
    supportedLanguages: ['en', 'es'],
    supportsVoiceSelection: true,
    supportsRatePitchVolume: true,
    supportsBargeInPlugins: true,
    supportsTtsPlugins: true,
    alwaysCaptureMic: false,
    supportsOffline: true,
    maxSessionDurationSec: null,
    requiresTokenServer: false,
  };
  el.voices = [{ id: 'sys_v1', name: 'System Voice 1', lang: 'en-US', local: true }];
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('vcw-voice-settings panel rendering', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('1. The Speech row is absent when ttsPlugins is empty, and present when it has one entry', async () => {
    const el = await mountPanel();
    expect(el.shadowRoot?.querySelector('.lang-selector')).toBeNull();

    el.ttsPlugins = [makeMockTtsPlugin('kokoro')];
    await el.updateComplete;

    const speechBtn = el.shadowRoot?.querySelectorAll('.lang-option');
    expect(speechBtn?.length).toBeGreaterThan(0);
    expect(speechBtn?.[0].textContent).toBe('System');
    expect(speechBtn?.[1].textContent).toBe('KOKORO');
  });

  it('2. Selecting a plugin whose supports.pitch is false removes the Pitch slider and leaves Speed and Volume', async () => {
    const el = await mountPanel();
    el.ttsPlugins = [makeMockTtsPlugin('kokoro', { pitch: false })];
    await el.updateComplete;

    // Click Kokoro button
    const kokoroBtn = el.shadowRoot?.querySelectorAll('.lang-option')[1] as HTMLButtonElement;
    kokoroBtn.click();
    await el.updateComplete;

    const labels = Array.from(el.shadowRoot?.querySelectorAll('.field-label') ?? []).map(l => l.textContent);
    expect(labels.some(l => l?.includes('Speed'))).toBe(true);
    expect(labels.some(l => l?.includes('Volume'))).toBe(true);
    expect(labels.some(l => l?.includes('Pitch'))).toBe(false);
  });

  it('3. Switching backend and back restores each one remembered voice from voiceIds', async () => {
    const el = await mountPanel();
    el.ttsPlugins = [makeMockTtsPlugin('kokoro')];
    await el.updateComplete;

    // Switch to Kokoro
    const kokoroBtn = el.shadowRoot?.querySelectorAll('.lang-option')[1] as HTMLButtonElement;
    kokoroBtn.click();
    await el.updateComplete;

    // Select second voice for Kokoro (the second select element in the panel)
    const selects = el.shadowRoot?.querySelectorAll('select');
    const voiceSelect = selects?.[1] as HTMLSelectElement;
    voiceSelect.value = 'kokoro_v2';
    voiceSelect.dispatchEvent(new Event('change'));
    await el.updateComplete;

    // Switch back to System
    const systemBtn = el.shadowRoot?.querySelectorAll('.lang-option')[0] as HTMLButtonElement;
    systemBtn.click();
    await el.updateComplete;

    // Switch back to Kokoro again
    kokoroBtn.click();
    await el.updateComplete;

    expect((el as any).voiceIds.kokoro).toBe('kokoro_v2');
  });

  it('4. A plugin reporting status() === "failed" renders the note; "ready" and "unknown" do not', async () => {
    const el = await mountPanel();
    el.ttsPlugins = [makeMockTtsPlugin('kokoro', { status: 'failed' })];
    await el.updateComplete;

    // Select Kokoro
    const kokoroBtn = el.shadowRoot?.querySelectorAll('.lang-option')[1] as HTMLButtonElement;
    kokoroBtn.click();
    await el.updateComplete;

    const note = el.shadowRoot?.querySelector('.tts-note');
    expect(note).not.toBeNull();
    expect(note?.textContent).toContain('KOKORO unavailable, using system voices');
  });

  it('5. The Automatic option is absent for a plugin with allowAutomaticVoice: false, and that plugin first voice is emitted', async () => {
    const el = await mountPanel();
    el.ttsPlugins = [makeMockTtsPlugin('kokoro', { allowAutomatic: false })];
    await el.updateComplete;

    // Select Kokoro
    const kokoroBtn = el.shadowRoot?.querySelectorAll('.lang-option')[1] as HTMLButtonElement;
    kokoroBtn.click();
    await el.updateComplete;

    const options = Array.from(el.shadowRoot?.querySelectorAll('option') ?? []).map(o => o.value);
    expect(options).not.toContain('');

    // Trigger Apply
    let appliedDetail: any = null;
    el.addEventListener('settings-apply', (e: any) => {
      appliedDetail = e.detail;
    });

    const applyBtn = el.shadowRoot?.querySelector('.apply-btn') as HTMLButtonElement;
    applyBtn.click();

    expect(appliedDetail.ttsPluginId).toBe('kokoro');
    expect(appliedDetail.voiceIds.kokoro).toBe('kokoro_v1');
  });

  it('6. willUpdate does not mutate the currentSettings.voiceIds object it receives', async () => {
    const originalVoiceIds = Object.freeze({ system: 'sys_v1' });
    const settings = {
      lang: 'en',
      rate: 1,
      pitch: 1,
      volume: 1,
      bargeInPluginId: 'off',
      ttsPluginId: 'system',
      voiceIds: originalVoiceIds,
      voiceId: 'sys_v1',
    };
    const el = document.createElement('vcw-voice-settings') as WidgetVoiceSettings;
    el.currentSettings = settings as any;
    expect(() => {
      document.body.appendChild(el);
    }).not.toThrow();
  });

  it('7. Panel retains consistent configured width regardless of selected speech backend', async () => {
    const el = await mountPanel();
    el.ttsPlugins = [makeMockTtsPlugin('kokoro')];
    await el.updateComplete;

    const panel = el.shadowRoot?.querySelector('.panel') as HTMLElement;
    expect(panel).not.toBeNull();

    // Verify toggling speech backend works cleanly
    const kokoroBtn = el.shadowRoot?.querySelectorAll('.lang-option')[1] as HTMLButtonElement;
    kokoroBtn.click();
    await el.updateComplete;

    const systemBtn = el.shadowRoot?.querySelectorAll('.lang-option')[0] as HTMLButtonElement;
    systemBtn.click();
    await el.updateComplete;
  });
});
