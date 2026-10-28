/**
 * DOM-independent utility functions.
 */
export { isVoiceChatSupported } from './browser-support.js';
export { SessionTimer } from './timer.js';
export { LogLevel, createLogger, setLogLevel } from './logger.js';
export { blobToBase64 } from './blob.js';
export {
  FLOOR_DB,
  CEIL_DB,
  rmsToLevel,
  analyserRms,
  micErrorKind,
  type AnalyserScratch,
  type TimeDomainAnalyser,
} from './audio-level.js';
