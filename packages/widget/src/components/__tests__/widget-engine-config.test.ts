import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../widget-root.js';

/**
 * Covers the wiring from widget attributes to the engine's constructor config.
 * Types guard the option names; these guard the values put behind them.
 */

/** Mount a widget with `setEngine` stubbed, and return the config it was given. */
async function captureEngineConfig(attrs: Record<string, string>): Promise<any> {
  const el = document.createElement('ariontalk-widget') as any;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);

  const setEngine = vi.fn().mockResolvedValue(undefined);
  document.body.appendChild(el);
  await el.updateComplete;
  // Replace after the controller exists, then re-trigger engine init.
  el.controller.setEngine = setEngine;
  await el.initEngine();

  return { el, setEngine, config: setEngine.mock.calls.at(-1)?.[1] };
}

describe('widget engine config', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('passes site-key to the engine as an opaque token request extra', async () => {
    const { config } = await captureEngineConfig({ 'site-key': 'sk_test_123' });

    expect(config.tokenRequestExtras).toEqual({ siteKey: 'sk_test_123' });
  });

  it('does not send an extras object when no site-key is set', async () => {
    const { config } = await captureEngineConfig({
      'token-server': 'https://tokens.example.test/api/token',
      engine: 'gemini',
    });

    // An empty object would put `siteKey: undefined` on the wire.
    expect(config.tokenRequestExtras).toBeUndefined();
  });

  it('does not pass a bare siteKey field the engine would ignore', async () => {
    const { config } = await captureEngineConfig({ 'site-key': 'sk_test_123' });

    expect(config.siteKey).toBeUndefined();
  });

  it('names the engine option tokenServerUrl, matching GeminiEngineOptions', async () => {
    const { config } = await captureEngineConfig({ 'site-key': 'sk_test_123' });

    expect(config.tokenServerUrl).toBe('https://api.ariontalk.com/api/token');
    expect(config.tokenServer).toBeUndefined();
  });

  it('reaches the engine with localized messages', async () => {
    const { config } = await captureEngineConfig({
      'site-key': 'sk_test_123',
      'ui-lang': 'es',
    });

    expect(config.messages).toBeDefined();
    expect(config.messages.connectionLost).toBeTruthy();
  });

  it('passes the remaining engine options through', async () => {
    const { config } = await captureEngineConfig({
      'site-key': 'sk_test_123',
      'gemini-voice': 'Puck',
      'interactive-highlights': '',
    });

    expect(config.voice).toBe('Puck');
    expect(config.interactiveHighlights).toBe(true);
    expect(config.onSessionEnd).toBeTypeOf('function');
  });

  it('omits null plugins from the local engine config', async () => {
    // The engine declares these optional, not nullable.
    const el = document.createElement('ariontalk-widget') as any;
    const setEngine = vi.fn().mockResolvedValue(undefined);
    document.body.appendChild(el);
    await el.updateComplete;
    el.controller.setEngine = setEngine;
    await el.handleFabClick();

    const localCall = setEngine.mock.calls.find((c: any[]) => c[0] === 'local');
    expect(localCall?.[1].bargeInDetector).toBeUndefined();
    expect(localCall?.[1].synthesizer).toBeUndefined();
  });
});
