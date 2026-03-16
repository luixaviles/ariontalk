// Types
export type {
  SupportedLang, WellKnownLang, VoiceSettings, VoiceInfo, ImageContext,
  BargeInDetector, EngineStatus, VoiceEngineState,
  EngineCapabilities, VoiceEngineInterface,
} from './types.js';

// Engine
export { VoiceEngine } from './engine/voice-engine.js';
export type { VoiceEngineOptions } from './engine/voice-engine.js';

// Services (for advanced consumers)
export { SpeechRecognitionService } from './services/speech-recognition.js';
export { SpeechSynthesisService } from './services/speech-synthesis.js';
export { AISessionService } from './services/ai-session.js';
export { PageExtractorService } from './services/page-extractor.js';
export type { PageExtractorOptions } from './services/page-extractor.js';
export { EnergyBargeInDetector } from './services/barge-in-detector.js';

// Utils
export { isVoiceChatSupported } from './utils/browser-support.js';
export { SessionTimer } from './utils/timer.js';
export { blobToBase64 } from './utils/blob.js';

// Logging
export { LogLevel, createLogger, setLogLevel } from './utils/logger.js';
