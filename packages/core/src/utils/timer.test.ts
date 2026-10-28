import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionTimer } from './timer.js';

describe('SessionTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts at 0 by default', () => {
    const timer = new SessionTimer();
    expect(timer.elapsed).toBe(0);
    expect(timer.formatted).toBe('0:00');
  });

  it('accepts initialSeconds in constructor for session resumption', () => {
    const timer = new SessionTimer(undefined, 45);
    expect(timer.elapsed).toBe(45);
    expect(timer.formatted).toBe('0:45');
  });

  it('increments from initialSeconds when started', () => {
    const ticks: number[] = [];
    const timer = new SessionTimer((sec) => ticks.push(sec), 45);

    timer.start();
    vi.advanceTimersByTime(2000);
    timer.stop();

    expect(timer.elapsed).toBe(47);
    expect(ticks).toEqual([46, 47]);
  });

  it('resets to initialSeconds when requested', () => {
    const timer = new SessionTimer(undefined, 10);
    timer.start();
    vi.advanceTimersByTime(5000);
    expect(timer.elapsed).toBe(15);

    timer.reset(30);
    expect(timer.elapsed).toBe(30);
  });
});
