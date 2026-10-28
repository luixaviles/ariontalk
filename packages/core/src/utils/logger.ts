export enum LogLevel {
  Disabled = 'disabled',
  Errors   = 'error',
  Warnings = 'warning',
  Info     = 'info',
  Debug    = 'debug',
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.Disabled]: 0,
  [LogLevel.Errors]:   1,
  [LogLevel.Warnings]: 2,
  [LogLevel.Info]:     3,
  [LogLevel.Debug]:    4,
};

const REGISTRY_KEY = '__ariontalk_loggers__';
const LEVEL_KEY = '__ariontalk_log_level__';
const loggers: Logger[] = ((globalThis as any)[REGISTRY_KEY] ??= []);
// Backed by globalThis so multiple bundle instances of this module
// (e.g., the main bundle + a dynamically-imported engine chunk) share
// the same log level. Without this, loggers created in a second module
// instance would default to Disabled even after setLogLevel ran.
function getCurrentLevel(): LogLevel {
  return ((globalThis as any)[LEVEL_KEY] ?? LogLevel.Disabled) as LogLevel;
}
function setCurrentLevel(level: LogLevel): void {
  (globalThis as any)[LEVEL_KEY] = level;
}

class Logger {
  private _level: LogLevel = LogLevel.Disabled;
  private _prefix: string;

  constructor(scope: string) {
    this._prefix = `[ariontalk:${scope}]`;
  }

  get level(): LogLevel { return this._level; }
  set level(value: LogLevel) { this._level = value; }

  error(...args: unknown[]): void {
    if (LEVEL_PRIORITY[this._level] >= LEVEL_PRIORITY[LogLevel.Errors])
      console.error(this._prefix, ...args);
  }

  warn(...args: unknown[]): void {
    if (LEVEL_PRIORITY[this._level] >= LEVEL_PRIORITY[LogLevel.Warnings])
      console.warn(this._prefix, ...args);
  }

  info(...args: unknown[]): void {
    if (LEVEL_PRIORITY[this._level] >= LEVEL_PRIORITY[LogLevel.Info])
      console.info(this._prefix, ...args);
  }

  debug(...args: unknown[]): void {
    if (LEVEL_PRIORITY[this._level] >= LEVEL_PRIORITY[LogLevel.Debug])
      console.debug(this._prefix, ...args);
  }
}

export function createLogger(scope: string): Logger {
  const logger = new Logger(scope);
  logger.level = getCurrentLevel();
  loggers.push(logger);
  return logger;
}

export function setLogLevel(level: LogLevel): void {
  setCurrentLevel(level);
  for (const logger of loggers) {
    logger.level = level;
  }
}
