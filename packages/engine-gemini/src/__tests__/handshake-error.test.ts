/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiEngine } from '../gemini-engine.js';
import { WsClient, WsHandshakeError } from '@ariontalk/engine-cloud-ws';

describe('GeminiEngine handshake error handling', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'auth_tokens/test-token' }),
    });

    vi.spyOn(GeminiEngine.prototype as any, 'connect');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('routes pre-ack WsHandshakeError with terminal closeEvent (1007) to handleDisconnect without retries', async () => {
    let sessionEndDetail: any = null;
    const engine = new GeminiEngine({
      tokenServerUrl: 'https://example.test/api/token',
      onSessionEnd: (detail) => {
        sessionEndDetail = detail;
      },
    });

    const stateHistory: string[] = [];
    engine.onStateChange = (state) => {
      if (state.error) {
        stateHistory.push(state.error);
      }
    };

    const closeEvent = {
      code: 1007,
      reason: 'Invalid voice name NotAVoice',
    } as CloseEvent;

    vi.spyOn(WsClient, 'connect').mockRejectedValue(
      new WsHandshakeError('WebSocket closed before handshake ack: code 1007', closeEvent),
    );

    (engine as any).audioPlayback = {
      init: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
    };
    (engine as any).audioCapture = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
    };

    const handleDisconnectSpy = vi.spyOn(engine as any, 'handleDisconnect');
    const reconnectSpy = vi.spyOn(engine as any, 'reconnectWithResumption');

    (GeminiEngine.prototype as any).connect.mockRestore();

    await engine.startSession('en');

    expect(handleDisconnectSpy).toHaveBeenCalledWith(closeEvent);
    expect(reconnectSpy).not.toHaveBeenCalled();
    expect(sessionEndDetail).not.toBeNull();
    expect(sessionEndDetail.reason).toBe('error');
    expect(stateHistory.some((err) => err.includes('Invalid session configuration: Invalid voice name NotAVoice'))).toBe(true);
  });

  it('routes pre-ack WsHandshakeError with auth code (4001) as terminal without retries', async () => {
    let sessionEndDetail: any = null;
    const engine = new GeminiEngine({
      tokenServerUrl: 'https://example.test/api/token',
      onSessionEnd: (detail) => {
        sessionEndDetail = detail;
      },
    });

    const stateHistory: string[] = [];
    engine.onStateChange = (state) => {
      if (state.error) {
        stateHistory.push(state.error);
      }
    };

    const closeEvent = {
      code: 4001,
      reason: 'Unauthorized',
    } as CloseEvent;

    vi.spyOn(WsClient, 'connect').mockRejectedValue(
      new WsHandshakeError('WebSocket closed before handshake ack: code 4001', closeEvent),
    );

    (engine as any).audioPlayback = {
      init: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
    };
    (engine as any).audioCapture = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
    };

    const reconnectSpy = vi.spyOn(engine as any, 'reconnectWithResumption');
    (GeminiEngine.prototype as any).connect.mockRestore();

    await engine.startSession('en');

    expect(reconnectSpy).not.toHaveBeenCalled();
    expect(sessionEndDetail?.reason).toBe('error');
    expect(stateHistory.some((err) => err.includes('Authentication failed'))).toBe(true);
  });
});
