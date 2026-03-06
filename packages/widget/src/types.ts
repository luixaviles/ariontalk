export type { SupportedLang, VoiceSettings, BargeInDetector, EngineStatus, VoiceEngineState } from '@ariontalk/core';

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
