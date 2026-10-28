/**
 * UI primitives, without the assembled widget or the engine it loads.
 *
 * Registers the same `<vcw-*>` elements as the main barrel and shares their
 * modules, so mixing the two entries in one bundle is safe. Mixing source and
 * built output is not: two module instances, duplicate `@customElement`.
 */

export { WidgetFab } from './components/widget-fab.js';
export { WidgetSession, getErrorCopy } from './components/widget-session.js';
export { WidgetMinimized } from './components/widget-minimized.js';
export { WidgetVoiceSettings } from './components/widget-voice-settings.js';
export { isReducedMotion } from './controllers/level-loop.js';

export { sharedStyles } from './styles/shared-styles.js';

export { detectUiLocale, detectGreetingLang, getStrings } from './i18n.js';
export type { UiLocale, UiStrings } from './i18n.js';

export type { SupportedLang, VoiceSettings, VoiceEngineState, EngineErrorCode } from './types.js';
export type { BargeInPlugin, TtsPlugin, TtsLoadStatus } from './types.js';
