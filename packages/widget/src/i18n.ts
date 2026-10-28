import type { SupportedLang } from './types.js';

export interface UiStrings {
  voiceChat: string;          // FAB default label
  settings: string;           // gear aria-label
  starting: string;
  connecting: string;
  loadingVoice: string;
  preparingVoice: string;
  loadingModel: string;
  preparingModel: string;
  listening: string;
  muted: string;
  thinking: string;
  speaking: string;
  answering: string;          // visually hidden "{title} is answering"
  you: string;                // "You" label on visitor caption
  sealLabel: string;          // "Offline · Private"
  sealExplainer: string;
  errorLabel: string;
  minimize: string;           // aria-label + title
  backToConversation: string; // "Back to the conversation ({state})"
  minStateListening: string;
  minStateHearing: string;
  minStateThinking: string;
  minStateSpeaking: string;
  minStateMuted: string;
  minStateError: string;
  restoreVoiceChat: string;
  restoreVoiceChatMuted: string;
  mute: string;
  unmute: string;
  muteShort: string;
  unmuteShort: string;
  endShort: string;
  micTurnOff: string;
  micTurnOn: string;
  endVoiceChat: string;
  retry: string;
  close: string;
  permTitle: string;          // "{title} needs your microphone"
  permBodyOnDevice: string;
  permBody: string;
  permAllow: string;
  permNotNow: string;
  errMicBlockedTitle: string;
  errMicBlockedDetail: string;
  errMicNotFoundTitle: string;
  errMicNotFoundDetail: string;
  errSpeechUnavailableTitle: string;
  errSpeechUnavailableDetail: string;
  errSpeechStoppedTitle: string;
  errSpeechStoppedDetail: string;
  errModelUnavailableTitle: string;
  errModelUnavailableDetail: string;
  errModelMemoryTitle: string;
  errModelMemoryDetail: string;
  errAnswerFailedTitle: string;
  errAnswerFailedDetail: string;
  errLangSwitchFailedTitle: string;
  errLangSwitchFailedDetail: string;
  errStartFailedTitle: string;
  errStartFailedDetail: string;
  settingsTitle: string;
  back: string;
  language: string;
  automatic: string;
  speech: string;
  speechSystem: string;
  speechSystemHint: string;
  ttsUnavailable: string;     // "{label} unavailable, using system voices"
  voice: string;
  voiceTierPremium: string;
  voiceTierLocal: string;
  voiceTierNetwork: string;
  voiceTierGoogle: string;
  voiceLocal: string;
  voiceRemote: string;
  speed: string;
  pitch: string;
  volume: string;
  interruption: string;
  interruptionOff: string;
  interruptionOffHint: string;
  apply: string;
  sessionDuration: string;
  poweredBy: string;          // "Powered by" / "Con tecnología de"
  opensInNewTab: string;      // attribution aria-label suffix
  connectionLost: string;
  sessionEndingSoon: string;
  failedToStart: string;
  couldNotConnect: string;
  connectionError: string;    // "{status}" is replaced with the HTTP status code
  invalidResponse: string;
  navigatedTo: string;        // "Navigated to:" / "Fuiste a:" (aria-live)
  askAQuestion: string;
}

/**
 * To add a UI language: add an entry here. Everything else (UiLocale type,
 * detection, lookups) derives from this map.
 */
const DICTIONARIES = {
  en: {
    voiceChat: 'Ask about this page',
    settings: 'Settings',
    starting: 'Starting…',
    connecting: 'Connecting…',
    loadingVoice: 'Loading voice...',
    preparingVoice: 'Preparing voice...',
    loadingModel: 'Loading AI model...',
    preparingModel: 'Preparing model...',
    listening: 'I\'m listening',
    muted: 'Microphone off',
    thinking: 'Searching the page',
    speaking: 'Speaking...',
    answering: '{title} is answering',
    you: 'You',
    sealLabel: 'Offline · Private',
    sealExplainer: 'Everything happens on your device: what you say and what\'s on this page never leave your browser. Answers come only from this page.',
    errorLabel: 'Error',
    minimize: 'Minimize (the conversation continues)',
    backToConversation: 'Back to the conversation ({state})',
    minStateListening: 'listening',
    minStateHearing: 'hearing you',
    minStateThinking: 'searching the page',
    minStateSpeaking: 'answering',
    minStateMuted: 'microphone off',
    minStateError: 'stopped',
    restoreVoiceChat: 'Restore voice chat',
    restoreVoiceChatMuted: 'Restore voice chat (muted)',
    mute: 'Mute microphone',
    unmute: 'Unmute microphone',
    muteShort: 'Mute',
    unmuteShort: 'Unmute',
    endShort: 'End',
    micTurnOff: 'Turn microphone off',
    micTurnOn: 'Turn microphone on',
    endVoiceChat: 'End voice chat',
    retry: 'Retry',
    close: 'Close',
    permTitle: '{title} needs your microphone',
    permBodyOnDevice: 'Your voice is processed on this device. It\'s never recorded or sent.',
    permBody: 'It\'s only used while the conversation is open.',
    permAllow: 'Allow microphone',
    permNotNow: 'Not now',
    errMicBlockedTitle: 'Your microphone is blocked',
    errMicBlockedDetail: 'Turn it on from the icon next to the page address, then try again.',
    errMicNotFoundTitle: 'We can\'t find a microphone',
    errMicNotFoundDetail: 'Connect one or check your system settings, then try again.',
    errSpeechUnavailableTitle: 'Voice input isn\'t available',
    errSpeechUnavailableDetail: 'This browser can\'t recognize speech on this device.',
    errSpeechStoppedTitle: 'The assistant stopped',
    errSpeechStoppedDetail: 'Voice processing on your device was interrupted.',
    errModelUnavailableTitle: 'The assistant isn\'t available',
    errModelUnavailableDetail: 'The AI model on this device couldn\'t load.',
    errModelMemoryTitle: 'We couldn\'t start the assistant',
    errModelMemoryDetail: 'Your browser doesn\'t have enough memory for the AI model.',
    errAnswerFailedTitle: 'Something went wrong',
    errAnswerFailedDetail: '{title} couldn\'t finish that answer. Ask again.',
    errLangSwitchFailedTitle: 'Couldn\'t switch language',
    errLangSwitchFailedDetail: 'Try again, or keep the current language.',
    errStartFailedTitle: 'We couldn\'t start the assistant',
    errStartFailedDetail: 'Something went wrong while loading. Try again.',
    settingsTitle: 'Settings',
    back: 'Back',
    language: 'Language',
    automatic: 'Automatic',
    speech: 'Speech',
    speechSystem: 'System',
    speechSystemHint: 'Voices from your browser and operating system.',
    ttsUnavailable: '{label} unavailable, using system voices',
    voice: 'Voice',
    voiceTierPremium: 'Premium',
    voiceTierLocal: 'Local',
    voiceTierNetwork: 'Network',
    voiceTierGoogle: 'Google',
    voiceLocal: 'local',
    voiceRemote: 'remote',
    speed: 'Speed',
    pitch: 'Pitch',
    volume: 'Volume',
    interruption: 'Interruption',
    interruptionOff: 'Off',
    interruptionOffHint: 'Wait for the response to finish.',
    apply: 'Apply',
    sessionDuration: 'Session duration',
    poweredBy: 'Powered by',
    opensInNewTab: 'opens ariontalk.com in a new tab',
    connectionLost: 'Connection lost',
    sessionEndingSoon: 'Session ending in 3 minutes',
    failedToStart: 'Failed to start session',
    couldNotConnect: 'Could not connect to the voice service',
    connectionError: 'Connection error ({status}). Please try again.',
    invalidResponse: 'The voice service returned an invalid response',
    navigatedTo: 'Navigated to:',
    askAQuestion: 'Ask a question',
  },
  es: {
    voiceChat: 'Pregunta sobre esta página',
    settings: 'Configuración',
    starting: 'Iniciando…',
    connecting: 'Conectando…',
    loadingVoice: 'Cargando voz...',
    preparingVoice: 'Preparando voz...',
    loadingModel: 'Cargando modelo de IA...',
    preparingModel: 'Preparando modelo...',
    listening: 'Te escucho',
    muted: 'Micrófono apagado',
    thinking: 'Buscando en la página',
    speaking: 'Hablando...',
    answering: '{title} está respondiendo',
    you: 'Tú',
    sealLabel: 'Sin conexión · Privado',
    sealExplainer: 'Todo ocurre en tu dispositivo: lo que dices y lo que hay en esta página nunca salen de tu navegador. Las respuestas salen solo de esta página.',
    errorLabel: 'Error',
    minimize: 'Minimizar (la conversación continúa)',
    backToConversation: 'Volver a la conversación ({state})',
    minStateListening: 'escuchando',
    minStateHearing: 'te está oyendo',
    minStateThinking: 'buscando en la página',
    minStateSpeaking: 'respondiendo',
    minStateMuted: 'micrófono apagado',
    minStateError: 'detenido',
    restoreVoiceChat: 'Restaurar chat de voz',
    restoreVoiceChatMuted: 'Restaurar chat de voz (silenciado)',
    mute: 'Silenciar micrófono',
    unmute: 'Activar micrófono',
    muteShort: 'Silenciar',
    unmuteShort: 'Activar',
    endShort: 'Finalizar',
    micTurnOff: 'Apagar micrófono',
    micTurnOn: 'Encender micrófono',
    endVoiceChat: 'Finalizar chat de voz',
    retry: 'Reintentar',
    close: 'Cerrar',
    permTitle: '{title} necesita tu micrófono',
    permBodyOnDevice: 'Tu voz se procesa en este dispositivo. Nunca se graba ni se envía.',
    permBody: 'Solo se usa mientras la conversación está abierta.',
    permAllow: 'Permitir micrófono',
    permNotNow: 'Ahora no',
    errMicBlockedTitle: 'Tu micrófono está bloqueado',
    errMicBlockedDetail: 'Actívalo desde el icono junto a la dirección de la página y vuelve a intentarlo.',
    errMicNotFoundTitle: 'No encontramos un micrófono',
    errMicNotFoundDetail: 'Conecta uno o revisa la configuración del sistema y vuelve a intentarlo.',
    errSpeechUnavailableTitle: 'La entrada de voz no está disponible',
    errSpeechUnavailableDetail: 'Este navegador no puede reconocer la voz en este dispositivo.',
    errSpeechStoppedTitle: 'El asistente se detuvo',
    errSpeechStoppedDetail: 'El procesamiento de voz en tu dispositivo se interrumpió.',
    errModelUnavailableTitle: 'El asistente no está disponible',
    errModelUnavailableDetail: 'El modelo de IA de este dispositivo no pudo cargarse.',
    errModelMemoryTitle: 'No pudimos iniciar el asistente',
    errModelMemoryDetail: 'Tu navegador no tiene memoria suficiente para el modelo de IA.',
    errAnswerFailedTitle: 'Algo salió mal',
    errAnswerFailedDetail: '{title} no pudo terminar esa respuesta. Vuelve a preguntar.',
    errLangSwitchFailedTitle: 'No se pudo cambiar el idioma',
    errLangSwitchFailedDetail: 'Inténtalo de nuevo o sigue con el idioma actual.',
    errStartFailedTitle: 'No pudimos iniciar el asistente',
    errStartFailedDetail: 'Algo salió mal al cargar. Inténtalo de nuevo.',
    settingsTitle: 'Configuración',
    back: 'Atrás',
    language: 'Idioma',
    automatic: 'Automático',
    speech: 'Voz del asistente',
    speechSystem: 'Sistema',
    speechSystemHint: 'Voces de tu navegador y sistema operativo.',
    ttsUnavailable: '{label} no disponible, se usan las voces del sistema',
    voice: 'Voz',
    voiceTierPremium: 'Premium',
    voiceTierLocal: 'Local',
    voiceTierNetwork: 'Red',
    voiceTierGoogle: 'Google',
    voiceLocal: 'local',
    voiceRemote: 'remota',
    speed: 'Velocidad',
    pitch: 'Tono',
    volume: 'Volumen',
    interruption: 'Interrupción',
    interruptionOff: 'No',
    interruptionOffHint: 'Espera a que termine la respuesta.',
    apply: 'Aplicar',
    sessionDuration: 'Duración de la sesión',
    poweredBy: 'Con tecnología de',
    opensInNewTab: 'abre ariontalk.com en una pestaña nueva',
    connectionLost: 'Conexión perdida',
    sessionEndingSoon: 'La sesión finalizará en 3 minutos',
    failedToStart: 'Error al iniciar la sesión',
    couldNotConnect: 'No se pudo conectar con el servicio de voz',
    connectionError: 'Error de conexión ({status}). Inténtalo de nuevo.',
    invalidResponse: 'El servicio de voz devolvió una respuesta no válida',
    navigatedTo: 'Fuiste a:',
    askAQuestion: 'Haz una pregunta',
  },
} satisfies Record<string, UiStrings>;

export type UiLocale = keyof typeof DICTIONARIES;

const UI_LOCALES = Object.keys(DICTIONARIES) as UiLocale[];

/**
 * Languages the voice agent can be asked to greet in. Runtime mirror of the
 * engine's supported speech languages (WellKnownLang minus 'auto'),
 * independent of the smaller UI dictionary above.
 */
const GREETING_LANGS: readonly SupportedLang[] = [
  'en', 'es', 'ja', 'fr', 'de', 'pt', 'it', 'zh', 'ko', 'hi', 'ar', 'ru',
];

/** "es-ES" / "es_MX" / "ES" -> "es" */
function primarySubtag(langString?: string | null): string | undefined {
  if (!langString) return undefined;
  const tag = langString.trim().split(/[-_]/)[0].toLowerCase();
  return tag.length > 0 ? tag : undefined;
}

function pageLangCandidates(override?: string): (string | undefined)[] {
  return [
    override,
    typeof document !== 'undefined' ? document.documentElement.lang : undefined,
  ];
}

/**
 * Locale for widget UI strings. Detection order: explicit override, page
 * <html lang>, browser language. Falls back to 'en'.
 */
export function detectUiLocale(override?: string): UiLocale {
  const candidates = [
    ...pageLangCandidates(override),
    typeof navigator !== 'undefined' ? navigator.language : undefined,
  ];
  for (const candidate of candidates) {
    const tag = primarySubtag(candidate);
    if (tag && (UI_LOCALES as string[]).includes(tag)) return tag as UiLocale;
  }
  return 'en';
}

/**
 * Language the agent should greet in. Unlike detectUiLocale, this covers
 * every engine speech language and deliberately ignores navigator.language:
 * the greeting should match the site, not the visitor's browser chrome.
 * Returns undefined when the page doesn't declare a supported language, so
 * the server keeps its default "respond in the visitor's language" behavior
 * instead of receiving a wrong guess.
 */
export function detectGreetingLang(override?: string): SupportedLang | undefined {
  for (const candidate of pageLangCandidates(override)) {
    const tag = primarySubtag(candidate);
    if (tag && GREETING_LANGS.includes(tag)) return tag;
  }
  return undefined;
}

export function getStrings(locale: UiLocale): UiStrings {
  return DICTIONARIES[locale] ?? DICTIONARIES.en;
}
