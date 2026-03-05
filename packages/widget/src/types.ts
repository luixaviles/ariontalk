export type { SupportedLang, VoiceSettings, BargeInMode, EngineStatus, VoiceEngineState } from '@ariontalk/core';

// Widget-specific alias for backward compatibility
export type { EngineStatus as WidgetStatus } from '@ariontalk/core';

// Widget uses VoiceEngineState directly as VoiceSessionState
export type { VoiceEngineState as VoiceSessionState } from '@ariontalk/core';
