import { describe, it, expect } from 'vitest';
import {
  LIVE_API_VERSION,
  buildLiveUrl,
  buildSetupFrame,
  isSetupComplete,
  encodeAudioChunk,
  encodeText,
  encodeClientContent,
  encodeToolResponse,
} from '../gemini-protocol.js';

describe('gemini-protocol', () => {
  describe('buildLiveUrl', () => {
    it('uses v1alpha API version by default', () => {
      const url = buildLiveUrl('auth_tokens/test-token');
      expect(LIVE_API_VERSION).toBe('v1alpha');
      expect(url).toContain('.v1alpha.GenerativeService.');
    });

    it('produces BidiGenerateContentConstrained and access_token for ephemeral token preserving slash', () => {
      const token = 'auth_tokens/xyz_12345';
      const url = buildLiveUrl(token);

      expect(url).toBe(
        'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=auth_tokens/xyz_12345',
      );
    });

    it('produces BidiGenerateContent and key for raw API key token', () => {
      const apiKey = 'AIzaSyRawKey123';
      const url = buildLiveUrl(apiKey);

      expect(url).toBe(
        'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=AIzaSyRawKey123',
      );
    });

    it('supports custom apiVersion override if specified', () => {
      const url = buildLiveUrl('auth_tokens/test', 'v1beta');
      expect(url).toContain('.v1beta.GenerativeService.');
    });
  });

  describe('buildSetupFrame', () => {
    it('adds models/ prefix when missing', () => {
      const frame = buildSetupFrame('gemini-3.1-flash-live-preview') as any;
      expect(frame.setup.model).toBe('models/gemini-3.1-flash-live-preview');
    });

    it('does not duplicate models/ prefix when already present', () => {
      const frame = buildSetupFrame('models/gemini-3.1-flash-live-preview') as any;
      expect(frame.setup.model).toBe('models/gemini-3.1-flash-live-preview');
    });

    it('places responseModalities inside generationConfig, not at setup root', () => {
      const frame = buildSetupFrame('gemini-3.1-flash-live-preview') as any;
      expect(frame.setup.generationConfig).toEqual({ responseModalities: ['AUDIO'] });
      expect(frame.setup.responseModalities).toBeUndefined();
    });

    it('omits sessionResumption entirely when handle is null, undefined, or empty', () => {
      const frame1 = buildSetupFrame('gemini-3.1-flash-live-preview', null) as any;
      const frame2 = buildSetupFrame('gemini-3.1-flash-live-preview', undefined) as any;
      expect(frame1.setup.sessionResumption).toBeUndefined();
      expect(frame2.setup.sessionResumption).toBeUndefined();
    });

    it('includes sessionResumption when handle is provided', () => {
      const frame = buildSetupFrame('gemini-3.1-flash-live-preview', 'resume-handle-123') as any;
      expect(frame.setup.sessionResumption).toEqual({ handle: 'resume-handle-123' });
    });

    it('carries no systemInstruction, tools, speechConfig, or thinkingConfig', () => {
      const frame = buildSetupFrame('gemini-3.1-flash-live-preview') as any;
      expect(frame.setup.systemInstruction).toBeUndefined();
      expect(frame.setup.tools).toBeUndefined();
      expect(frame.setup.speechConfig).toBeUndefined();
      expect(frame.setup.thinkingConfig).toBeUndefined();
      expect(frame.setup.inputAudioTranscription).toBeUndefined();
      expect(frame.setup.outputAudioTranscription).toBeUndefined();
    });
  });

  describe('isSetupComplete', () => {
    it('detects setupComplete presence', () => {
      expect(isSetupComplete({ setupComplete: {} })).toBe(true);
      expect(isSetupComplete({ serverContent: { modelTurn: { parts: [] } } })).toBe(false);
      expect(isSetupComplete({})).toBe(false);
    });
  });

  describe('encoding functions', () => {
    it('encodes audio chunk with default 16000 sample rate', () => {
      const frame = encodeAudioChunk('base64AudioData');
      expect(frame).toEqual({
        realtimeInput: {
          audio: {
            data: 'base64AudioData',
            mimeType: 'audio/pcm;rate=16000',
          },
        },
      });
    });

    it('encodes audio chunk with custom sample rate', () => {
      const frame = encodeAudioChunk('base64AudioData', 24000);
      expect(frame).toEqual({
        realtimeInput: {
          audio: {
            data: 'base64AudioData',
            mimeType: 'audio/pcm;rate=24000',
          },
        },
      });
    });

    it('encodes text trigger frame', () => {
      const frame = encodeText('[Session started]');
      expect(frame).toEqual({
        realtimeInput: {
          text: '[Session started]',
        },
      });
    });

    it('encodes clientContent with turns and turnComplete', () => {
      const parts = [
        { text: 'Image 1:' },
        { inlineData: { data: 'imgB64', mimeType: 'image/jpeg' } },
      ];
      const frame = encodeClientContent(parts, false);
      expect(frame).toEqual({
        clientContent: {
          turns: [
            {
              role: 'user',
              parts,
            },
          ],
          turnComplete: false,
        },
      });
    });

    it('encodes toolResponse with functionResponses', () => {
      const responses = [
        {
          id: 'call-1',
          name: 'highlight_and_scroll',
          response: { success: true },
        },
      ];
      const frame = encodeToolResponse(responses);
      expect(frame).toEqual({
        toolResponse: {
          functionResponses: responses,
        },
      });
    });
  });
});
