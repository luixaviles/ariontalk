import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CompositeSynthesizer } from '../composite-synthesizer.js';
import type { SpeechSynthesizer, SupportedLang, VoiceInfo, VoiceSettings } from '@ariontalk/core';

function createMockSynthesizer(id: string, opts?: { isReady?: boolean; supportsLang?: boolean }): SpeechSynthesizer {
  return {
    id,
    isReady: opts?.isReady ?? true,
    init: vi.fn().mockResolvedValue(undefined),
    supportsLang: vi.fn().mockReturnValue(opts?.supportsLang ?? true),
    enqueue: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn(),
    getVoices: vi.fn().mockReturnValue([{ id: `${id}_v1`, name: `${id} Voice`, lang: 'en-US', local: true }]),
    applyVoiceSettings: vi.fn(),
    getVoiceOverrides: vi.fn().mockReturnValue(null),
    destroy: vi.fn(),
  };
}

describe('CompositeSynthesizer', () => {
  let base: SpeechSynthesizer;

  beforeEach(() => {
    base = createMockSynthesizer('system');
  });

  it('1. No active plugin routes to base', async () => {
    const composite = new CompositeSynthesizer(base, null);
    await composite.enqueue('Hello', 'en');
    expect(base.enqueue).toHaveBeenCalledWith('Hello', 'en', undefined);
  });

  it('2. Active plugin that is ready and language-compatible receives the utterance', async () => {
    const active = createMockSynthesizer('kokoro', { isReady: true, supportsLang: true });
    const composite = new CompositeSynthesizer(base, active);

    await composite.enqueue('Hello', 'en');

    expect(active.enqueue).toHaveBeenCalledWith('Hello', 'en', undefined);
    expect(base.enqueue).not.toHaveBeenCalled();
  });

  it('3. Active plugin with isReady === false routes to base', async () => {
    const active = createMockSynthesizer('kokoro', { isReady: false, supportsLang: true });
    const composite = new CompositeSynthesizer(base, active);

    await composite.enqueue('Hello', 'en');

    expect(base.enqueue).toHaveBeenCalledWith('Hello', 'en', undefined);
    expect(active.enqueue).not.toHaveBeenCalled();
  });

  it('4. Active plugin whose supportsLang returns false routes to base', async () => {
    const active = createMockSynthesizer('kokoro', { isReady: true, supportsLang: false });
    const composite = new CompositeSynthesizer(base, active);

    await composite.enqueue('Hola', 'es');

    expect(base.enqueue).toHaveBeenCalledWith('Hola', 'es', undefined);
    expect(active.enqueue).not.toHaveBeenCalled();
  });

  it('5. cancel() reaches both backends', () => {
    const active = createMockSynthesizer('kokoro');
    const composite = new CompositeSynthesizer(base, active);

    composite.cancel();

    expect(base.cancel).toHaveBeenCalled();
    expect(active.cancel).toHaveBeenCalled();
  });

  it('6. init() awaits active backend and forwards progress callback', async () => {
    const active = createMockSynthesizer('kokoro');
    const composite = new CompositeSynthesizer(base, active);
    const onProgress = vi.fn();

    await composite.init(onProgress);

    expect(base.init).toHaveBeenCalled();
    expect(active.init).toHaveBeenCalledWith(onProgress);
  });

  it('6b. init() propagates rejection from active backend', async () => {
    const active = createMockSynthesizer('kokoro');
    (active.init as any).mockRejectedValue(new Error('Network error loading ONNX model'));
    const composite = new CompositeSynthesizer(base, active);

    await expect(composite.init()).rejects.toThrow('Network error loading ONNX model');
    expect(base.init).toHaveBeenCalled();
  });

  it('7. getVoices() concatenates base and active voices', () => {
    const active = createMockSynthesizer('kokoro');
    const composite = new CompositeSynthesizer(base, active);

    const voices = composite.getVoices();
    expect(voices).toEqual([
      { id: 'system_v1', name: 'system Voice', lang: 'en-US', local: true },
      { id: 'kokoro_v1', name: 'kokoro Voice', lang: 'en-US', local: true },
    ]);
  });

  it('8. applyVoiceSettings() forwards to both backends', () => {
    const active = createMockSynthesizer('kokoro');
    const composite = new CompositeSynthesizer(base, active);

    const settings: VoiceSettings = { voiceId: 'v1', rate: 1.2, pitch: 1.0, volume: 0.8 };
    composite.applyVoiceSettings(settings);

    expect(base.applyVoiceSettings).toHaveBeenCalledWith(settings);
    expect(active.applyVoiceSettings).toHaveBeenCalledWith(settings);
  });

  it('9. destroy() forwards to both backends', () => {
    const active = createMockSynthesizer('kokoro');
    const composite = new CompositeSynthesizer(base, active);

    composite.destroy();

    expect(base.destroy).toHaveBeenCalled();
    expect(active.destroy).toHaveBeenCalled();
  });

  it('10. willUseActive returns true when active exists and supports language, false otherwise', () => {
    const active = createMockSynthesizer('kokoro', { supportsLang: true });
    const composite = new CompositeSynthesizer(base, active);

    expect(composite.willUseActive('en')).toBe(true);

    (active.supportsLang as any).mockReturnValue(false);
    expect(composite.willUseActive('es')).toBe(false);

    const noActive = new CompositeSynthesizer(base, null);
    expect(noActive.willUseActive('en')).toBe(false);
  });

  it('11. initBase initializes only the base synthesizer and does not call active.init', async () => {
    const active = createMockSynthesizer('kokoro');
    const composite = new CompositeSynthesizer(base, active);

    await composite.initBase();

    expect(base.init).toHaveBeenCalled();
    expect(active.init).not.toHaveBeenCalled();
  });

  it('12. getOutputLevel returns level of backend chosen by enqueue, null for unsupported language on active, and null after cancel/destroy', async () => {
    const noActive = new CompositeSynthesizer(base, null);
    await noActive.enqueue('Hello', 'en');
    expect(noActive.getOutputLevel()).toBeNull();

    const active = createMockSynthesizer('kokoro', { isReady: true });
    (active.supportsLang as any).mockImplementation((lang: SupportedLang) => lang === 'en');
    active.getOutputLevel = vi.fn().mockReturnValue(0.65);
    const composite = new CompositeSynthesizer(base, active);

    // Before enqueue -> null
    expect(composite.getOutputLevel()).toBeNull();

    // Enqueue supported language -> returns active level
    await composite.enqueue('Hello', 'en');
    expect(composite.getOutputLevel()).toBe(0.65);

    // Enqueue language Kokoro doesn't support -> routes to base, getOutputLevel returns null
    await composite.enqueue('Hola', 'es');
    expect(composite.getOutputLevel()).toBeNull();

    // Enqueue supported language again, then cancel -> clears speaking backend
    await composite.enqueue('Hello again', 'en');
    expect(composite.getOutputLevel()).toBe(0.65);
    composite.cancel();
    expect(composite.getOutputLevel()).toBeNull();

    // Enqueue supported language, then destroy -> clears speaking backend
    await composite.enqueue('Goodbye', 'en');
    expect(composite.getOutputLevel()).toBe(0.65);
    composite.destroy();
    expect(composite.getOutputLevel()).toBeNull();

    const notReady = createMockSynthesizer('kokoro', { isReady: false });
    notReady.getOutputLevel = vi.fn().mockReturnValue(0.65);
    const compositeNotReady = new CompositeSynthesizer(base, notReady);
    await compositeNotReady.enqueue('Hello', 'en');
    expect(compositeNotReady.getOutputLevel()).toBeNull();
  });
});
