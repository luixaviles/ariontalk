import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WsClient, WsHandshakeError } from '../ws-client.js';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  url: string;
  protocols?: string | string[];
  binaryType = 'blob';
  readyState = 0; // CONNECTING
  sent: string[] = [];

  onopen: ((ev: any) => any) | null = null;
  onmessage: ((ev: any) => any) | null = null;
  onerror: ((ev: any) => any) | null = null;
  onclose: ((ev: any) => any) | null = null;

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    this.sent.push(data);
  }

  close(code = 1000, reason = '') {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason } as any);
  }

  triggerOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({} as any);
  }

  triggerMessage(data: string | ArrayBuffer) {
    this.onmessage?.({ data } as any);
  }

  triggerError(error: any = new Event('error')) {
    this.onerror?.(error);
  }
}

describe('WsClient', () => {
  const originalWs = globalThis.WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    (globalThis as any).WebSocket = MockWebSocket;
  });

  afterEach(() => {
    (globalThis as any).WebSocket = originalWs;
    vi.restoreAllMocks();
  });

  it('sends handshake on open and sets binaryType to arraybuffer', async () => {
    const handshake = { setup: { model: 'test' } };
    const connectPromise = WsClient.connect({
      url: 'wss://test.local',
      handshake,
      isHandshakeAck: (msg: any) => msg.setupComplete !== undefined,
      onMessage: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });

    const ws = MockWebSocket.instances[0];
    expect(ws).toBeDefined();
    expect(ws.binaryType).toBe('arraybuffer');

    ws.triggerOpen();
    expect(ws.sent).toEqual([JSON.stringify(handshake)]);

    // Send ack frame to finish
    ws.triggerMessage(JSON.stringify({ setupComplete: {} }));
    const client = await connectPromise;
    expect(client.isOpen).toBe(true);
  });

  it('resolves only after the ack frame, not on open', async () => {
    let resolved = false;
    const connectPromise = WsClient.connect({
      url: 'wss://test.local',
      handshake: { setup: {} },
      isHandshakeAck: (msg: any) => msg.setupComplete !== undefined,
      onMessage: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    }).then((c) => {
      resolved = true;
      return c;
    });

    const ws = MockWebSocket.instances[0];
    ws.triggerOpen();
    await Promise.resolve();
    expect(resolved).toBe(false);

    // Non-ack message
    ws.triggerMessage(JSON.stringify({ other: true }));
    await Promise.resolve();
    expect(resolved).toBe(false);

    // Ack frame
    ws.triggerMessage(JSON.stringify({ setupComplete: {} }));
    await connectPromise;
    expect(resolved).toBe(true);
  });

  it('frames received between open and ack are replayed in order after resolve', async () => {
    const received: any[] = [];
    const connectPromise = WsClient.connect({
      url: 'wss://test.local',
      handshake: { setup: {} },
      isHandshakeAck: (msg: any) => msg.setupComplete !== undefined,
      onMessage: (msg) => received.push(msg),
      onError: vi.fn(),
      onClose: vi.fn(),
    });

    const ws = MockWebSocket.instances[0];
    ws.triggerOpen();

    ws.triggerMessage(JSON.stringify({ id: 1 }));
    ws.triggerMessage(JSON.stringify({ id: 2 }));
    expect(received).toEqual([]);

    ws.triggerMessage(JSON.stringify({ setupComplete: {} }));
    await connectPromise;

    expect(received).toEqual([{ id: 1 }, { id: 2 }]);

    ws.triggerMessage(JSON.stringify({ id: 3 }));
    expect(received).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });

  it('rejects on close before ack with WsHandshakeError carrying closeEvent', async () => {
    const connectPromise = WsClient.connect({
      url: 'wss://test.local',
      handshake: { setup: {} },
      isHandshakeAck: (msg: any) => msg.setupComplete !== undefined,
      onMessage: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });

    const ws = MockWebSocket.instances[0];
    ws.triggerOpen();
    const closeEv = { code: 1007, reason: 'Invalid session configuration' } as CloseEvent;
    ws.close(closeEv.code, closeEv.reason);

    await expect(connectPromise).rejects.toThrow(WsHandshakeError);
    await connectPromise.catch((err: any) => {
      expect(err).toBeInstanceOf(WsHandshakeError);
      expect(err.closeEvent?.code).toBe(1007);
      expect(err.closeEvent?.reason).toBe('Invalid session configuration');
    });
  });

  it('rejects on error before ack with WsHandshakeError carrying errorEvent', async () => {
    const connectPromise = WsClient.connect({
      url: 'wss://test.local',
      handshake: { setup: {} },
      isHandshakeAck: (msg: any) => msg.setupComplete !== undefined,
      onMessage: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });

    const ws = MockWebSocket.instances[0];
    const customError = new Event('error');
    ws.triggerError(customError);

    await expect(connectPromise).rejects.toThrow(WsHandshakeError);
    await connectPromise.catch((err: any) => {
      expect(err).toBeInstanceOf(WsHandshakeError);
      expect(err.errorEvent).toBe(customError);
    });
  });

  it('rejects on handshake timeout even if socket never opens', async () => {
    vi.useFakeTimers();
    try {
      const connectPromise = WsClient.connect({
        url: 'wss://test.local',
        handshake: { setup: {} },
        handshakeTimeoutMs: 1000,
        isHandshakeAck: (msg: any) => msg.setupComplete !== undefined,
        onMessage: vi.fn(),
        onError: vi.fn(),
        onClose: vi.fn(),
      });

      const ws = MockWebSocket.instances[0];
      expect(ws).toBeDefined();
      expect(ws.readyState).toBe(0); // CONNECTING

      vi.advanceTimersByTime(1001);
      await expect(connectPromise).rejects.toThrow(WsHandshakeError);
      await connectPromise.catch((err: any) => {
        expect(err.message).toMatch(/Handshake timeout after 1000ms/);
        expect(err.closeEvent).toBeUndefined();
        expect(err.errorEvent).toBeUndefined();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('send after close does not throw and does not call through', async () => {
    const connectPromise = WsClient.connect({
      url: 'wss://test.local',
      handshake: { setup: {} },
      isHandshakeAck: (msg: any) => msg.setupComplete !== undefined,
      onMessage: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });

    const ws = MockWebSocket.instances[0];
    ws.triggerOpen();
    ws.triggerMessage(JSON.stringify({ setupComplete: {} }));
    const client = await connectPromise;

    client.send({ test: 'ok' });
    expect(ws.sent).toContain(JSON.stringify({ test: 'ok' }));

    client.close();
    expect(client.isOpen).toBe(false);

    expect(() => {
      client.send({ test: 'should not be sent' });
    }).not.toThrow();

    expect(ws.sent).not.toContain(JSON.stringify({ test: 'should not be sent' }));
  });

  it('close() does not fire onClose callback', async () => {
    const onClose = vi.fn();
    const connectPromise = WsClient.connect({
      url: 'wss://test.local',
      handshake: { setup: {} },
      isHandshakeAck: (msg: any) => msg.setupComplete !== undefined,
      onMessage: vi.fn(),
      onError: vi.fn(),
      onClose,
    });

    const ws = MockWebSocket.instances[0];
    ws.triggerOpen();
    ws.triggerMessage(JSON.stringify({ setupComplete: {} }));
    const client = await connectPromise;

    client.close();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('frames arriving as ArrayBuffer decode synchronously in order', async () => {
    const received: any[] = [];
    const connectPromise = WsClient.connect({
      url: 'wss://test.local',
      handshake: { setup: {} },
      isHandshakeAck: (msg: any) => msg.setupComplete !== undefined,
      onMessage: (msg) => received.push(msg),
      onError: vi.fn(),
      onClose: vi.fn(),
    });

    const ws = MockWebSocket.instances[0];
    ws.triggerOpen();
    ws.triggerMessage(JSON.stringify({ setupComplete: {} }));
    await connectPromise;

    const encoder = new TextEncoder();
    const buf1 = encoder.encode(JSON.stringify({ chunk: 1 })).buffer;
    const buf2 = encoder.encode(JSON.stringify({ chunk: 2 })).buffer;

    ws.triggerMessage(buf1);
    ws.triggerMessage(buf2);

    expect(received).toEqual([{ chunk: 1 }, { chunk: 2 }]);
  });

  it('frames arriving as ArrayBufferView decode respecting byteOffset and byteLength', async () => {
    const received: any[] = [];
    const connectPromise = WsClient.connect({
      url: 'wss://test.local',
      handshake: { setup: {} },
      isHandshakeAck: (msg: any) => msg.setupComplete !== undefined,
      onMessage: (msg) => received.push(msg),
      onError: vi.fn(),
      onClose: vi.fn(),
    });

    const ws = MockWebSocket.instances[0];
    ws.triggerOpen();
    ws.triggerMessage(JSON.stringify({ setupComplete: {} }));
    await connectPromise;

    const payload = JSON.stringify({ chunk: 42 });
    const full = new TextEncoder().encode(`__PREFIX__${payload}__SUFFIX__`);
    const offset = '__PREFIX__'.length;
    const length = new TextEncoder().encode(payload).length;
    const subview = new Uint8Array(full.buffer, full.byteOffset + offset, length);

    ws.triggerMessage(subview as any);

    expect(received).toEqual([{ chunk: 42 }]);
  });
});
