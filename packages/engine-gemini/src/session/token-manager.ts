import { createLogger } from '@ariontalk/core';

const log = createLogger('token-manager');

export interface EphemeralToken {
  token: string;
}

export interface TokenRequestPayload {
  model?: string;
  voice?: string;
  lang?: string;
  pageTitle?: string;
  pageUrl?: string;
  pageContent?: string;
  interactiveHighlights?: boolean;
}

export class TokenManager {
  constructor(private tokenServerUrl: string) {}

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
      throw new Error('Could not connect to token server');
    }

    if (!response.ok) {
      throw new Error(`Token server error (${response.status})`);
    }

    const data = await response.json();
    if (!data.token) {
      throw new Error('Token server returned invalid response');
    }

    log.info('Ephemeral token acquired');
    return { token: data.token };
  }
}
