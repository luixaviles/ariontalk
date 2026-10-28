export interface WsClientOptions<TIn> {
  /** Full connection URL including auth query parameters. */
  url: string;
  /** Optional WebSocket subprotocols, for providers that authenticate that way. */
  protocols?: string | string[];
  /** First frame sent on open. Serialized by the client. */
  handshake: unknown;
  /** Returns true when this decoded frame completes the handshake. */
  isHandshakeAck: (msg: TIn) => boolean;
  /** Milliseconds to wait for the handshake ack before rejecting. Default 15000. */
  handshakeTimeoutMs?: number;
  onMessage: (msg: TIn) => void;
  onError: (err: Event) => void;
  onClose: (event: CloseEvent) => void;
}

export class WsHandshakeError extends Error {
  constructor(
    message: string,
    /** Present when the handshake failed because the socket closed. */
    readonly closeEvent?: CloseEvent,
    /** Present when the handshake failed because the socket errored. */
    readonly errorEvent?: Event,
  ) {
    super(message);
    this.name = 'WsHandshakeError';
  }
}

export class WsClient<TIn> {
  private ws: WebSocket | null = null;
  private isClosedDeliberately = false;

  private constructor(ws: WebSocket) {
    this.ws = ws;
  }

  get readyState(): number {
    return this.ws ? this.ws.readyState : 3; // 3 = CLOSED
  }

  get isOpen(): boolean {
    return this.ws !== null && this.ws.readyState === 1; // 1 = OPEN
  }

  /**
   * Serializes frame to JSON and sends it.
   * Swallows errors if sending fails or socket is not open; never throws.
   */
  send(frame: unknown): void {
    if (!this.isOpen || !this.ws) return;
    try {
      this.ws.send(JSON.stringify(frame));
    } catch {
      // ignore
    }
  }

  /**
   * Closes the connection and detaches all event handlers so
   * a deliberate close does not trigger reconnect or onClose callbacks.
   */
  close(): void {
    this.isClosedDeliberately = true;
    if (!this.ws) return;
    const socket = this.ws;
    this.ws = null;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    try {
      socket.close();
    } catch {
      // ignore
    }
  }

  /**
   * Connects to a WebSocket endpoint and negotiates the initial handshake.
   * Resolves only after isHandshakeAck returns true for an incoming frame.
   * Frames arriving before the ack are queued and replayed in order upon resolution.
   */
  static connect<TIn>(options: WsClientOptions<TIn>): Promise<WsClient<TIn>> {
    return new Promise<WsClient<TIn>>((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = options.protocols
          ? new WebSocket(options.url, options.protocols)
          : new WebSocket(options.url);
      } catch (err) {
        reject(err);
        return;
      }

      ws.binaryType = 'arraybuffer';
      const client = new WsClient<TIn>(ws);
      const textDecoder = new TextDecoder();

      let isHandshakeComplete = false;
      let earlyQueue: TIn[] = [];
      const timeoutMs = options.handshakeTimeoutMs ?? 15000;

      let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
        if (!isHandshakeComplete) {
          cleanup();
          client.close();
          reject(new WsHandshakeError(`Handshake timeout after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      const cleanup = () => {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      ws.onopen = () => {
        try {
          ws.send(JSON.stringify(options.handshake));
        } catch (err) {
          cleanup();
          client.close();
          reject(err);
        }
      };

      ws.onmessage = (event: MessageEvent) => {
        let text: string;
        if (typeof event.data === 'string') {
          text = event.data;
        } else if (event.data instanceof ArrayBuffer) {
          text = textDecoder.decode(event.data);
        } else if (ArrayBuffer.isView(event.data)) {
          text = textDecoder.decode(event.data);
        } else {
          text = String(event.data);
        }

        let msg: TIn;
        try {
          msg = JSON.parse(text) as TIn;
        } catch {
          return;
        }

        if (!isHandshakeComplete) {
          if (options.isHandshakeAck(msg)) {
            isHandshakeComplete = true;
            cleanup();
            resolve(client);
            for (const queued of earlyQueue) {
              options.onMessage(queued);
            }
            earlyQueue = [];
          } else {
            earlyQueue.push(msg);
          }
        } else {
          options.onMessage(msg);
        }
      };

      ws.onerror = (err: Event) => {
        if (!isHandshakeComplete) {
          cleanup();
          client.close();
          reject(new WsHandshakeError('WebSocket error before handshake ack', undefined, err));
        } else {
          options.onError(err);
        }
      };

      ws.onclose = (event: CloseEvent) => {
        if (!isHandshakeComplete) {
          cleanup();
          client.close();
          reject(new WsHandshakeError(`WebSocket closed before handshake ack: code ${event.code}`, event));
        } else if (!client.isClosedDeliberately) {
          options.onClose(event);
        }
      };
    });
  }
}
