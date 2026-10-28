export type { SupportedLang, VoiceSettings, BargeInDetector, SpeechSynthesizer, EngineStatus, EngineErrorCode, VoiceEngineState } from '@ariontalk/core';

// Widget-specific alias for backward compatibility
export type { EngineStatus as WidgetStatus } from '@ariontalk/core';

// Widget uses VoiceEngineState directly as VoiceSessionState
export type { VoiceEngineState as VoiceSessionState } from '@ariontalk/core';

/** Descriptor for a barge-in plugin registered with the widget. */
export interface BargeInPlugin {
  /** Unique identifier, used for settings persistence. */
  id: string;
  /** Display label shown in the settings UI. */
  label: string;
  /** Optional tooltip describing the strategy. */
  tooltip?: string;
  /** Factory function that creates a new detector instance. Called per session. */
  create: () => import('@ariontalk/core').BargeInDetector;
}

export type TtsLoadStatus = 'unknown' | 'loading' | 'ready' | 'failed';

/** Descriptor for a TTS plugin registered with the widget. */
export interface TtsPlugin {
  /** Unique identifier, persisted in settings and matched to the synthesizer's id. */
  id: string;
  /** Display label shown on the button in the Speech row. */
  label: string;
  /** Optional tooltip. Use it to disclose download size. */
  tooltip?: string;
  /**
   * Voices this backend offers. Must be available without instantiating the
   * synthesizer or loading any model: the settings panel renders before a
   * session exists.
   */
  voices: import('@ariontalk/core').VoiceInfo[];
  /** Which tuning sliders this backend honors. Unsupported ones are hidden. */
  supports: { rate: boolean; pitch: boolean; volume: boolean };
  /** Whether the Voice dropdown should offer an "Automatic" entry. @default false */
  allowAutomaticVoice?: boolean;
  /** Side-effect-free support check. False renders the option disabled. */
  isSupported?: () => boolean;
  /** Shown under the Speech row when isSupported() returns false. */
  unsupportedReason?: string;
  /** Factory. Called per session, for the selected backend only. */
  create: () => import('@ariontalk/core').SpeechSynthesizer;
  /**
   * Optional. Called when the user applies settings selecting this backend.
   * Unlike `SpeechSynthesizer.init()`, this one **rejects** on failure so the
   * panel can report it.
   */
  preload?: (onProgress?: (loaded: number) => void) => Promise<void>;
  /**
   * Optional. Synchronous, side-effect-free read of load state, used to render
   * the failure note. Must never trigger a load: the panel calls it on render.
   */
  status?: () => TtsLoadStatus;
}
