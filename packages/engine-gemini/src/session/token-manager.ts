import { createLogger } from '@ariontalk/core';

const log = createLogger('token-manager');

export interface EphemeralToken {
  token: string;
  sessionMeta?: Record<string, unknown>;
  /**
   * The full parsed response body from the token server. Lets engine
   * extension hooks (e.g., `onTokenResponse`) read additional fields
   * the OSS types don't know about. Always populated by `fetchToken`.
   */
  raw?: Record<string, unknown>;
  model?: string;
}

export interface TokenRequestPayload {
  voice?: string;
  lang?: string;
  pageTitle?: string;
  pageUrl?: string;
  pageContent?: string;
  interactiveHighlights?: boolean;
  greetingLang?: string;
  [key: string]: unknown;
}

/** Visitor-facing error messages; "{status}" in connectionError is replaced with the HTTP status. */
export interface TokenManagerMessages {
  couldNotConnect?: string;
  connectionError?: string;
  invalidResponse?: string;
}

export class TokenManager {
  constructor(
    private tokenServerUrl: string,
    private messages?: TokenManagerMessages,
  ) {}

  async fetchToken(payload: TokenRequestPayload): Promise<EphemeralToken> {
    log.info('Fetching ephemeral token from', this.tokenServerUrl);

    let response: Response;
    try {
      response = await fetch(this.tokenServerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      throw new Error(this.messages?.couldNotConnect ?? 'Could not connect to token server');
    }

    if (!response.ok) {
      let message = (this.messages?.connectionError ?? 'Connection error ({status}). Please try again.')
        .replace('{status}', String(response.status));
      try {
        const data = await response.json();
        if (data.message || data.error) {
          message = data.message || data.error;
        }
      } catch {
        // use default message
      }
      throw new Error(message);
    }

    const data = await response.json();
    if (!data.token) {
      throw new Error(this.messages?.invalidResponse ?? 'Token server returned invalid response');
    }

    log.info('Ephemeral token acquired');
    return { token: data.token, sessionMeta: data.sessionMeta, model: data.model, raw: data };
  }
}