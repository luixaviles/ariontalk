import { createLogger } from '@ariontalk/core';

const log = createLogger('token-manager');

export interface EphemeralToken {
  token: string;
}

export class TokenManager {
  constructor(private tokenServerUrl: string) {}

  async fetchToken(model?: string, voice?: string): Promise<EphemeralToken> {
    log.info('Fetching ephemeral token from', this.tokenServerUrl);

    let response: Response;
    try {
      response = await fetch(this.tokenServerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, voice }),
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
