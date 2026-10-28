import type { SpeechSynthesizerStartMeta } from '@ariontalk/core';

export interface UtteranceTiming {
  /** Playback rate, used only for the estimate when the backend reports no duration. Default 1. */
  rate?: number;
}

export interface UtteranceHandle {
  /** Playback began. Pass the backend's start meta if it gave one. */
  start(meta?: SpeechSynthesizerStartMeta): void;
  /** Backend reached the word starting at charIndex in this utterance's text. */
  boundary(charIndex: number): void;
  /** Playback finished. Reveals whatever is left and commits the sentence. */
  end(): void;
}

interface WordToken {
  endIndex: number;
  weight: number;
}

interface ActiveUtterance {
  handle: InternalUtteranceHandle;
  text: string;
  tokens: WordToken[];
  revealAt: number[];
  startedAt: number;
  visibleIndex: number;
  timer: ReturnType<typeof setTimeout> | null;
}

type HandleStatus = 'created' | 'active' | 'done';

class InternalUtteranceHandle implements UtteranceHandle {
  status: HandleStatus = 'created';

  constructor(
    readonly generation: number,
    readonly text: string,
    readonly rate: number,
    private readonly manager: TurnCaptions,
  ) {}

  start(meta?: SpeechSynthesizerStartMeta): void {
    this.manager.startHandle(this, meta);
  }

  boundary(charIndex: number): void {
    this.manager.boundaryHandle(this, charIndex);
  }

  end(): void {
    this.manager.endHandle(this);
  }
}

/** Paces word-by-word captions across the utterances of a conversational turn. */
export class TurnCaptions {
  /** Receives the full caption text for the turn every time it changes. */
  onChange: ((text: string) => void) | null = null;

  private generation = 0;
  private committed: string[] = [];
  private active: ActiveUtterance | null = null;
  private lastEmitted = '';

  /** Registers the next utterance of the turn and returns its lifecycle handle. */
  utterance(text: string, timing?: UtteranceTiming): UtteranceHandle {
    const trimmed = text.trim();
    const rate = timing?.rate && timing.rate > 0 ? timing.rate : 1;
    return new InternalUtteranceHandle(this.generation, trimmed, rate, this);
  }

  /** Clears all active timers and committed turn state, resetting captions to empty. */
  reset(): void {
    this.generation++;
    if (this.active?.timer) {
      clearTimeout(this.active.timer);
    }
    this.active = null;
    this.committed = [];

    if (this.lastEmitted !== '') {
      this.lastEmitted = '';
      this.onChange?.('');
    }
  }

  /** Starts pacing playback for an utterance handle. */
  startHandle(handle: InternalUtteranceHandle, meta?: SpeechSynthesizerStartMeta): void {
    if (handle.generation !== this.generation || handle.status !== 'created') {
      return;
    }

    if (this.active) {
      this.active.visibleIndex = this.active.text.length;
      this.committed.push(this.active.text);
      this.active.handle.status = 'done';
      if (this.active.timer) {
        clearTimeout(this.active.timer);
      }
      this.active = null;
    }

    if (!handle.text) {
      handle.status = 'done';
      this.active = null;
      this.emit();
      return;
    }

    handle.status = 'active';

    const durationMs =
      meta?.durationMs && meta.durationMs > 0
        ? meta.durationMs
        : Math.max(800, Math.round((handle.text.length * 65) / handle.rate));

    const tokens = this.tokenize(handle.text);
    if (tokens.length === 0) {
      handle.status = 'done';
      this.active = null;
      return;
    }

    const totalWeight = tokens.reduce((sum, t) => sum + t.weight, 0);
    const revealAt: number[] = [0];
    let cumulativeWeight = tokens[0].weight;

    for (let i = 1; i < tokens.length; i++) {
      revealAt.push(Math.round((cumulativeWeight / totalWeight) * durationMs));
      cumulativeWeight += tokens[i].weight;
    }

    const active: ActiveUtterance = {
      handle,
      text: handle.text,
      tokens,
      revealAt,
      startedAt: performance.now(),
      visibleIndex: tokens[0].endIndex,
      timer: null,
    };

    this.active = active;
    this.emit();

    if (tokens.length > 1) {
      this.scheduleNextTick(active);
    }
  }

  /** Advances visible words based on native boundary notifications. */
  boundaryHandle(handle: InternalUtteranceHandle, charIndex: number): void {
    if (
      handle.generation !== this.generation ||
      handle.status !== 'active' ||
      !this.active ||
      this.active.handle !== handle
    ) {
      return;
    }

    const token = this.active.tokens.find((t) => t.endIndex > charIndex);
    if (!token) return;

    if (token.endIndex > this.active.visibleIndex) {
      this.active.visibleIndex = token.endIndex;
      this.emit();
    }
  }

  /** Finalizes playback of an utterance handle and flushes remaining text. */
  endHandle(handle: InternalUtteranceHandle): void {
    if (handle.generation !== this.generation || handle.status === 'done') {
      return;
    }

    if (handle.status === 'created') {
      handle.status = 'done';
      return;
    }

    if (this.active && this.active.handle === handle) {
      if (this.active.timer) {
        clearTimeout(this.active.timer);
        this.active.timer = null;
      }
      if (this.active.visibleIndex < this.active.text.length) {
        this.active.visibleIndex = this.active.text.length;
        this.emit();
      }
      this.committed.push(this.active.text);
      handle.status = 'done';
      this.active = null;
    }
  }

  private scheduleNextTick(active: ActiveUtterance): void {
    const elapsed = performance.now() - active.startedAt;
    const nextIndex = active.tokens.findIndex((_, i) => active.revealAt[i] > elapsed);
    if (nextIndex === -1) return;

    const delay = Math.max(0, active.revealAt[nextIndex] - elapsed);
    active.timer = setTimeout(() => this.onTick(active), delay);
  }

  private onTick(active: ActiveUtterance): void {
    if (
      active.handle.generation !== this.generation ||
      active.handle.status !== 'active' ||
      this.active !== active
    ) {
      return;
    }

    const elapsed = performance.now() - active.startedAt;
    let lastIndex = -1;
    for (let i = 0; i < active.tokens.length; i++) {
      if (active.revealAt[i] <= elapsed) {
        lastIndex = i;
      }
    }

    if (lastIndex >= 0) {
      const token = active.tokens[lastIndex];
      if (token.endIndex > active.visibleIndex) {
        active.visibleIndex = token.endIndex;
        this.emit();
      }
    }

    const nextIndex = active.tokens.findIndex((_, i) => active.revealAt[i] > elapsed);
    if (nextIndex !== -1) {
      const delay = Math.max(0, active.revealAt[nextIndex] - elapsed);
      active.timer = setTimeout(() => this.onTick(active), delay);
    } else {
      active.timer = null;
    }
  }

  private emit(): void {
    const visibleSlice = this.active
      ? this.active.text.slice(0, this.active.visibleIndex).trimEnd()
      : '';
    const text = [...this.committed, visibleSlice].filter(Boolean).join(' ');
    if (text === this.lastEmitted) return;

    this.lastEmitted = text;
    this.onChange?.(text);
  }

  private tokenize(text: string): WordToken[] {
    const wordPattern = /\S+(\s+|$)/g;
    const tokens: WordToken[] = [];
    let match: RegExpExecArray | null;

    while ((match = wordPattern.exec(text)) !== null) {
      const segment = match[0];
      const word = segment.trim();
      const endIndex = match.index + segment.length;
      const letters = word.replace(/[^\p{L}\p{N}]/gu, '');
      const weight = Math.max(2, letters.length) + 1;
      tokens.push({ endIndex, weight });
    }

    return tokens;
  }
}
