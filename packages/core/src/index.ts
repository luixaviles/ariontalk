// Types
export type {
  SupportedLang, WellKnownLang, VoiceSettings, VoiceInfo, ImageContext,
  BargeInDetector, SpeechSynthesizer, SpeechSynthesizerOptions, SpeechSynthesizerStartMeta,
  EngineStatus, EngineErrorCode, VoiceEngineState, EngineCapabilities, VoiceEngineInterface,
} from './types.js';

// Services (for advanced consumers)
export { PageExtractorService } from './services/page-extractor.js';
export type { PageExtractorOptions } from './services/page-extractor.js';
export { PageIndexerService } from './services/page-indexer.js';
export type { PageIndex, PageIndexerOptions, IndexedImage } from './services/page-indexer.js';
export { EnergyBargeInDetector } from './services/barge-in-detector.js';
export { HighlightManager } from './services/highlight-manager.js';

// Utils
export { isVoiceChatSupported } from './utils/browser-support.js';
export { SessionTimer } from './utils/timer.js';
export { blobToBase64 } from './utils/blob.js';
export {
  FLOOR_DB,
  CEIL_DB,
  rmsToLevel,
  analyserRms,
  micErrorKind,
  type AnalyserScratch,
  type TimeDomainAnalyser,
} from './utils/audio-level.js';

// Logging
export { LogLevel, createLogger, setLogLevel } from './utils/logger.js';
