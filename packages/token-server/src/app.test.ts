import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Behavior } from '@google/genai';
import { createTokenApp } from './app.js';

type CreateAuthTokenParams = {
  config?: {
    liveConnectConstraints?: {
      model?: string;
      config?: Record<string, unknown>;
    };
  };
};

describe('POST /api/token', () => {
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalLiveModel = process.env.GEMINI_LIVE_MODEL;

  let capturedParams: CreateAuthTokenParams | undefined;

  function makeApp() {
    capturedParams = undefined;
    return createTokenApp({
      createClient: () => ({
        authTokens: {
          create: async (params: CreateAuthTokenParams) => {
            capturedParams = params;
            return { name: 'auth_tokens/mock-token-123' };
          },
        } as unknown as import('@google/genai').GoogleGenAI['authTokens'],
      }),
    });
  }

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-api-key';
    delete process.env.GEMINI_LIVE_MODEL;
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalApiKey;
    }
    if (originalLiveModel === undefined) {
      delete process.env.GEMINI_LIVE_MODEL;
    } else {
      process.env.GEMINI_LIVE_MODEL = originalLiveModel;
    }
  });

  it('defaults to gemini-3.8-live, omits thinkingConfig, and returns { token, model }', async () => {
    const app = makeApp();
    const res = await app.request('/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.deepEqual(json, {
      token: 'auth_tokens/mock-token-123',
      model: 'gemini-3.8-live',
    });

    const constraints = capturedParams?.config?.liveConnectConstraints;
    assert.equal(constraints?.model, 'gemini-3.8-live');
    assert.ok(constraints?.config);
    assert.equal('thinkingConfig' in constraints.config, false);
    assert.equal('tools' in constraints.config, false);
  });

  it('respects GEMINI_LIVE_MODEL environment override', async () => {
    process.env.GEMINI_LIVE_MODEL = 'gemini-custom-env-live';
    const app = makeApp();
    const res = await app.request('/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.deepEqual(json, {
      token: 'auth_tokens/mock-token-123',
      model: 'gemini-custom-env-live',
    });
    assert.equal(
      capturedParams?.config?.liveConnectConstraints?.model,
      'gemini-custom-env-live',
    );
  });

  it('allows request body model override over default and GEMINI_LIVE_MODEL', async () => {
    process.env.GEMINI_LIVE_MODEL = 'gemini-custom-env-live';
    const app = makeApp();
    const res = await app.request('/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gemini-req-override-live' }),
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.deepEqual(json, {
      token: 'auth_tokens/mock-token-123',
      model: 'gemini-req-override-live',
    });
    assert.equal(
      capturedParams?.config?.liveConnectConstraints?.model,
      'gemini-req-override-live',
    );
  });

  it('declares highlight_and_scroll with Behavior.BLOCKING when interactiveHighlights is true', async () => {
    const app = makeApp();
    const res = await app.request('/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interactiveHighlights: true }),
    });

    assert.equal(res.status, 200);
    const tools = capturedParams?.config?.liveConnectConstraints?.config?.tools as Array<{
      functionDeclarations: Array<{ name: string; behavior?: unknown }>;
    }>;
    assert.ok(Array.isArray(tools));
    assert.equal(tools.length, 1);
    assert.equal(tools[0].functionDeclarations[0].name, 'highlight_and_scroll');
    assert.equal(tools[0].functionDeclarations[0].behavior, Behavior.BLOCKING);
  });
});
