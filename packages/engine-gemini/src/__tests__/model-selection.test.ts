/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiEngine } from '../gemini-engine.js';
import { WsClient } from '@ariontalk/engine-cloud-ws';

describe('GeminiEngine model selection', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('uses gemini-3.8-live by default when token response does not specify a model', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'auth_tokens/test-token' }),
    });

    const connectSpy = vi.spyOn(WsClient, 'connect').mockImplementation(async () => ({
      send: vi.fn(),
      close: vi.fn(),
      isOpen: true,
    } as any));

    const engine = new GeminiEngine({
      tokenServerUrl: 'https://example.test/api/token',
    });

    (engine as any).audioPlayback = {
      init: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
    };
    (engine as any).audioCapture = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
    };

    await engine.startSession('en');

    expect(connectSpy).toHaveBeenCalled();
    const callArgs = connectSpy.mock.calls[0][0];
    expect((callArgs.handshake as any).setup.model).toBe('models/gemini-3.8-live');
  });

  it('uses model specified by token server response when provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'auth_tokens/test-token', model: 'custom-live-model' }),
    });

    const connectSpy = vi.spyOn(WsClient, 'connect').mockImplementation(async () => ({
      send: vi.fn(),
      close: vi.fn(),
      isOpen: true,
    } as any));

    const engine = new GeminiEngine({
      tokenServerUrl: 'https://example.test/api/token',
    });

    (engine as any).audioPlayback = {
      init: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
    };
    (engine as any).audioCapture = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
    };

    await engine.startSession('en');

    expect(connectSpy).toHaveBeenCalled();
    const callArgs = connectSpy.mock.calls[0][0];
    expect((callArgs.handshake as any).setup.model).toBe('models/custom-live-model');
  });
});
