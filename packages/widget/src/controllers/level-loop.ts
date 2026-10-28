export type LevelSource = () => { input: number; output: number | null } | null;

export interface LevelSyncOptions {
  panel?: string | null;
  status: string;
  muted: boolean;
  userSpeaking: boolean;
  source: LevelSource | null | undefined;
  inputSelector: string;
  barsContainerSelector: string;
  barsSelector: string;
  barScale: number;
  weights: readonly number[];
  reducedMotionHeights: readonly number[];
}

const SMOOTHING = 0.45;

export function isReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Polls `getSource()` every 60 ms, applies exponential smoothing per channel,
 * and passes `{ input, output }` to `onTick`.
 * Does not start if `prefers-reduced-motion: reduce` is active.
 */
export class LevelLoop {
  private timerId: ReturnType<typeof setInterval> | null = null;
  private smoothedInput = 0;
  private smoothedOutput = 0;
  private stopped = true;
  private lastKey = '';
  private currentSource: LevelSource | null | undefined = null;

  sync(root: ShadowRoot | null | undefined, opts: LevelSyncOptions): void {
    this.currentSource = opts.source;

    if (isReducedMotion()) {
      this.stop();
      const inputEl = root?.querySelector<HTMLElement>(opts.inputSelector);
      if (inputEl) inputEl.style.removeProperty('--lvl');
      const barEls = root?.querySelectorAll<HTMLElement>(opts.barsSelector);
      if (barEls && barEls.length === opts.reducedMotionHeights.length) {
        barEls.forEach((b, i) => {
          b.style.height = `${opts.reducedMotionHeights[i]}px`;
        });
      }
      return;
    }

    const loopKey = `${opts.panel ?? ''}|${opts.status}|${opts.userSpeaking}|${opts.muted}|${Boolean(opts.source)}`;
    if (loopKey === this.lastKey) return;

    const isVisitorSpeaking = !opts.panel && opts.status === 'listening' && !opts.muted && opts.userSpeaking;
    if (isVisitorSpeaking && opts.source) {
      this.start(
        () => this.currentSource,
        ({ input }) => {
          const el = root?.querySelector<HTMLElement>(opts.inputSelector);
          if (el) {
            el.style.setProperty('--lvl', input.toFixed(2));
          }
        },
        60,
      );
      this.lastKey = loopKey;
      return;
    }

    // Bars follow output while speaking; callers that don't render bars pass a null source.
    const isSpeaking = !opts.panel && opts.status === 'speaking';
    if (isSpeaking && opts.source) {
      this.start(
        () => this.currentSource,
        ({ output }) => {
          const container = root?.querySelector(opts.barsContainerSelector);
          if (output === null) {
            container?.classList.add('css-anim');
            this.stop();
            this.lastKey = loopKey;
            return;
          }
          container?.classList.remove('css-anim');
          const barEls = root?.querySelectorAll<HTMLElement>(opts.barsSelector);
          if (!barEls) return;
          barEls.forEach((b, i) => {
            const h = Math.max(5, Math.round(5 + output * opts.barScale * opts.weights[i]));
            b.style.height = `${h}px`;
          });
        },
        60,
      );
      this.lastKey = loopKey;
      return;
    }

    this.stop();
    this.lastKey = loopKey;
  }

  start(
    getSource: () => LevelSource | null | undefined,
    onTick: (levels: { input: number; output: number | null }) => void,
    intervalMs = 60,
  ): void {
    this.stop();
    if (isReducedMotion()) return;
    const source = getSource();
    if (!source) return;

    this.stopped = false;
    const tick = () => {
      if (isReducedMotion()) {
        this.stop();
        return;
      }
      const fn = getSource();
      if (!fn) return;
      const levels = fn();
      if (!levels) return;

      this.smoothedInput = this.smoothedInput * SMOOTHING + levels.input * (1 - SMOOTHING);
      let output: number | null = null;
      if (levels.output !== null) {
        this.smoothedOutput = this.smoothedOutput * SMOOTHING + levels.output * (1 - SMOOTHING);
        output = this.smoothedOutput;
      } else {
        this.smoothedOutput = 0;
      }

      onTick({ input: this.smoothedInput, output });
    };

    tick();
    if (!this.stopped) {
      this.timerId = setInterval(tick, intervalMs);
    }
  }

  stop(): void {
    this.lastKey = '';
    this.stopped = true;
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.smoothedInput = 0;
    this.smoothedOutput = 0;
  }

  get running(): boolean {
    return this.timerId !== null;
  }
}
