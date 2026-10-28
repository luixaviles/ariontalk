import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectUiLocale, detectGreetingLang, getStrings } from './i18n.js';

describe('detectUiLocale', () => {
  let originalHtmlLang: string;
  let originalNavigatorLanguage: string;

  beforeEach(() => {
    if (typeof document !== 'undefined') {
      originalHtmlLang = document.documentElement.lang;
    }
    if (typeof navigator !== 'undefined') {
      originalNavigatorLanguage = navigator.language;
    }
  });

  afterEach(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = originalHtmlLang;
    }
    if (typeof navigator !== 'undefined') {
      Object.defineProperty(navigator, 'language', {
        value: originalNavigatorLanguage,
        configurable: true,
      });
    }
  });

  it('resolves explicit override first', () => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = 'en';
    }
    expect(detectUiLocale('es')).toBe('es');
    expect(detectUiLocale('es-ES')).toBe('es');
    expect(detectUiLocale('en')).toBe('en');
  });

  it('falls back to html lang if no override or override is invalid', () => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = 'es-ES';
    }
    expect(detectUiLocale('fr')).toBe('es'); // invalid override, fallback to HTML
    expect(detectUiLocale()).toBe('es');
  });

  it('falls back to navigator language if html lang is invalid or empty', () => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = '';
    }
    if (typeof navigator !== 'undefined') {
      Object.defineProperty(navigator, 'language', {
        value: 'es-MX',
        configurable: true,
      });
    }
    expect(detectUiLocale()).toBe('es');
  });

  it('falls back to en if all else fails or are unsupported', () => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = 'fr';
    }
    if (typeof navigator !== 'undefined') {
      Object.defineProperty(navigator, 'language', {
        value: 'ja',
        configurable: true,
      });
    }
    expect(detectUiLocale()).toBe('en');
  });
});

describe('detectGreetingLang', () => {
  let originalHtmlLang: string;

  beforeEach(() => {
    originalHtmlLang = document.documentElement.lang;
  });

  afterEach(() => {
    document.documentElement.lang = originalHtmlLang;
  });

  it('resolves explicit override first', () => {
    document.documentElement.lang = 'es';
    expect(detectGreetingLang('fr')).toBe('fr');
    expect(detectGreetingLang('ja-JP')).toBe('ja');
  });

  it('covers engine languages beyond the UI dictionary', () => {
    document.documentElement.lang = 'fr-FR';
    expect(detectGreetingLang()).toBe('fr');
  });

  it('returns undefined when the page declares no supported language', () => {
    document.documentElement.lang = '';
    Object.defineProperty(navigator, 'language', { value: 'es-MX', configurable: true });
    // navigator.language is deliberately not a greeting source
    expect(detectGreetingLang()).toBeUndefined();
  });

  it('returns undefined for unsupported languages', () => {
    document.documentElement.lang = 'sv';
    expect(detectGreetingLang()).toBeUndefined();
  });
});

describe('getStrings', () => {
  it('returns the matching dictionary', () => {
    expect(getStrings('es').listening).toBe('Te escucho');
    expect(getStrings('en').listening).toBe("I'm listening");
  });

  it('falls back to English for an unknown locale value', () => {
    expect(getStrings('fr' as never).listening).toBe("I'm listening");
  });

  it('has matching keys in en and es, and preserves all baseline keys', () => {
    const enKeys = Object.keys(getStrings('en')).sort();
    const esKeys = Object.keys(getStrings('es')).sort();
    expect(esKeys).toEqual(enKeys);

    const baselineKeys = [
      'voiceChat', 'settings', 'connecting', 'loadingVoice', 'preparingVoice',
      'loadingModel', 'preparingModel', 'listening', 'muted', 'thinking',
      'speaking', 'errorLabel', 'minimize', 'restoreVoiceChat',
      'restoreVoiceChatMuted', 'mute', 'unmute', 'endVoiceChat',
      'sessionDuration', 'poweredBy', 'opensInNewTab', 'connectionLost',
      'sessionEndingSoon', 'failedToStart', 'couldNotConnect',
      'connectionError', 'invalidResponse', 'navigatedTo', 'askAQuestion',
    ];
    for (const key of baselineKeys) {
      expect(enKeys).toContain(key);
    }
  });
});
