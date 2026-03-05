/**
 * Simple elapsed-time counter for voice sessions.
 */
export class SessionTimer {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private _elapsed = 0;
  private onTick: ((seconds: number) => void) | null = null;

  constructor(onTick?: (seconds: number) => void) {
    this.onTick = onTick ?? null;
  }

  get elapsed(): number {
    return this._elapsed;
  }

  get formatted(): string {
    const mins = Math.floor(this._elapsed / 60);
    const secs = this._elapsed % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  start(): void {
    if (this.intervalId !== null) return;
    this.intervalId = setInterval(() => {
      this._elapsed++;
      this.onTick?.(this._elapsed);
    }, 1000);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  reset(): void {
    this.stop();
    this._elapsed = 0;
  }
}
