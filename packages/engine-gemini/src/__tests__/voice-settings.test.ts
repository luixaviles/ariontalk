import { describe, it, expect, vi } from 'vitest';
import { GeminiEngine } from '../gemini-engine.js';

function makeEngine(voice?: string) {
  return new GeminiEngine({ tokenServerUrl: 'https://example.test/api/token', voice });
}

describe('GeminiEngine.applyVoiceSettings', () => {
  it('accepts a known Gemini voice', () => {
    const engine = makeEngine();
    engine.applyVoiceSettings({ voiceId: 'Puck', rate: 1, pitch: 1, volume: 1 });
    expect(engine.getVoiceOverrides()?.voiceId).toBe('Puck');
  });

  it('ignores a Web Speech voice from the local engine', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = makeEngine();

    engine.applyVoiceSettings({ voiceId: 'Google US English', rate: 1, pitch: 1, volume: 1 });

    // Falls back to the constructor default rather than a name the service rejects.
    expect(engine.getVoiceOverrides()?.voiceId).toBe('Kore');
    warn.mockRestore();
  });

  it('keeps the configured voice when given an unknown one', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = makeEngine('Zephyr');

    engine.applyVoiceSettings({ voiceId: 'not-a-voice', rate: 1, pitch: 1, volume: 1 });

    expect(engine.getVoiceOverrides()?.voiceId).toBe('Zephyr');
    warn.mockRestore();
  });

  it('ignores an empty voiceId', () => {
    const engine = makeEngine('Leda');
    engine.applyVoiceSettings({ voiceId: null, rate: 1, pitch: 1, volume: 1 });
    expect(engine.getVoiceOverrides()?.voiceId).toBe('Leda');
  });
});
