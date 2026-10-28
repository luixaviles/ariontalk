import type { EnginePart, FunctionResponse, LiveServerMessage } from './types.js';

export const LIVE_API_VERSION = 'v1alpha';

/**
 * Builds the Gemini Live WebSocket endpoint URL.
 * Ephemeral tokens (prefixed with "auth_tokens/") use the constrained method and access_token param.
 * Raw API keys use BidiGenerateContent and the key param.
 */
export function buildLiveUrl(token: string, apiVersion: string = LIVE_API_VERSION): string {
  const isEphemeral = token.startsWith('auth_tokens/');
  const method = isEphemeral ? 'BidiGenerateContentConstrained' : 'BidiGenerateContent';
  const param = isEphemeral ? 'access_token' : 'key';
  return `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${apiVersion}.GenerativeService.${method}?${param}=${token}`;
}

/**
 * Builds the initial handshake setup frame for Gemini Live.
 * Ensures the model has the 'models/' prefix and places responseModalities
 * inside generationConfig as required by the Live API specification.
 */
export function buildSetupFrame(model: string, resumptionHandle?: string | null): unknown {
  const formattedModel = model.startsWith('models/') ? model : `models/${model}`;
  const setup: Record<string, unknown> = {
    model: formattedModel,
    generationConfig: {
      responseModalities: ['AUDIO'],
    },
  };
  if (resumptionHandle) {
    setup.sessionResumption = { handle: resumptionHandle };
  }
  return { setup };
}

/** Returns true when the decoded server message indicates that setup is complete. */
export function isSetupComplete(msg: LiveServerMessage): boolean {
  return Boolean(msg.setupComplete);
}

/** Encodes a raw 16-bit PCM base64 audio chunk for the realtimeInput channel. */
export function encodeAudioChunk(base64Pcm: string, sampleRate: number = 16000): unknown {
  return {
    realtimeInput: {
      audio: {
        data: base64Pcm,
        mimeType: `audio/pcm;rate=${sampleRate}`,
      },
    },
  };
}

/** Encodes a text trigger frame for the realtimeInput channel. */
export function encodeText(text: string): unknown {
  return {
    realtimeInput: {
      text,
    },
  };
}

/** Encodes client context turns (e.g. page DOM images or custom context). */
export function encodeClientContent(parts: EnginePart[], turnComplete: boolean = false): unknown {
  return {
    clientContent: {
      turns: [
        {
          role: 'user',
          parts,
        },
      ],
      turnComplete,
    },
  };
}

/** Encodes tool call function responses. */
export function encodeToolResponse(responses: FunctionResponse[]): unknown {
  return {
    toolResponse: {
      functionResponses: responses,
    },
  };
}
