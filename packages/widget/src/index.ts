export { ArionTalk } from './components/widget-root.js';
export type { BargeInPlugin, TtsPlugin, TtsLoadStatus } from './types.js';

// Reusable UI primitives for downstream wrappers. Importing the modules
// also registers their <vcw-*> custom elements via Lit's @customElement
// decorator. The classes are exported for direct programmatic use.
export { WidgetFab } from './components/widget-fab.js';
export { WidgetSession } from './components/widget-session.js';
export { WidgetMinimized } from './components/widget-minimized.js';
export type { WidgetVoiceSettings } from './components/widget-voice-settings.js';
export { VoiceSessionController } from './controllers/voice-session.controller.js';
export { sharedStyles } from './styles/shared-styles.js';
export type { SupportedLang, VoiceSettings, VoiceEngineState, EngineErrorCode } from './types.js';
export { detectUiLocale, detectGreetingLang, getStrings } from './i18n.js';
export type { UiLocale, UiStrings } from './i18n.js';
