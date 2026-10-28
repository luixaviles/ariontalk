/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioPlayback, base64ToFloat32 } from '../audio-playback.js';

describe('AudioPlayback', () => {
  let playback: AudioPlayback;

  beforeEach(() => {
    playback = new AudioPlayback();
  });

  afterEach(() => {
    playback.destroy();
    vi.useRealTimers();
  });

  it('decodes base64 PCM int16 samples to Float32Array accurately', () => {
    // Int16Array samples: [0, 16384, -32768, 32767]
    const int16 = new Int16Array([0, 16384, -32768, 32767]);
    const bytes = new Uint8Array(int16.buffer);
    const binary = String.fromCharCode(...bytes);
    const base64 = btoa(binary);

    const float32 = base64ToFloat32(base64);

    expect(float32.length).toBe(4);
    expect(float32[0]).toBeCloseTo(0, 4);
    expect(float32[1]).toBeCloseTo(0.5, 4);
    expect(float32[2]).toBeCloseTo(-1.0, 4);
    expect(float32[3]).toBeCloseTo(0.99997, 4);
  });

  it('handleDrained dispatches all callbacks and survives errors in individual callbacks', () => {
    const errorCb = vi.fn(() => {
      throw new Error('Callback failure');
    });
    const successCb = vi.fn();

    (playback as any)._playing = true;

    playback.onDrained(errorCb);
    playback.onDrained(successCb);

    expect(errorCb).not.toHaveBeenCalled();
    expect(successCb).not.toHaveBeenCalled();

    // Trigger the real handleDrained method
    (playback as any).handleDrained();

    expect(errorCb).toHaveBeenCalledTimes(1);
    expect(successCb).toHaveBeenCalledTimes(1);
    expect(playback.playing).toBe(false);
    expect((playback as any).drainedCallbacks.size).toBe(0);
  });

  it('handles timeout-guarded onDrained callbacks via real drain or fallback timer', () => {
    vi.useFakeTimers();

    // Case 1: Timeout fires first when real drain is never delivered
    (playback as any)._playing = true;
    const timeoutCb = vi.fn();
    playback.onDrained(timeoutCb, 1000);

    expect(timeoutCb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(timeoutCb).toHaveBeenCalledTimes(1);

    // Subsequent handleDrained does not fire timeoutCb again (once-guard)
    (playback as any).handleDrained();
    expect(timeoutCb).toHaveBeenCalledTimes(1);

    // Case 2: Real drain fires before timeout
    (playback as any)._playing = true;
    const realDrainCb = vi.fn();
    playback.onDrained(realDrainCb, 1000);

    (playback as any).handleDrained();
    expect(realDrainCb).toHaveBeenCalledTimes(1);

    // Advancing timer later does not re-fire realDrainCb
    vi.advanceTimersByTime(2000);
    expect(realDrainCb).toHaveBeenCalledTimes(1);

    // Case 3: clear() cancels pending fallback timers
    (playback as any)._playing = true;
    (playback as any).workletNode = { port: { postMessage: vi.fn() }, disconnect: vi.fn() };
    const cancelledCb = vi.fn();
    playback.onDrained(cancelledCb, 1000);

    playback.clear();
    vi.advanceTimersByTime(2000);
    expect(cancelledCb).not.toHaveBeenCalled();
  });

  it('updates state on enqueue and resets state on clear', () => {
    const postMessageMock = vi.fn();
    (playback as any).workletNode = { port: { postMessage: postMessageMock }, disconnect: vi.fn() };

    // Int16Array: 2400 samples at 24kHz = 0.1s
    const int16 = new Int16Array(2400);
    const bytes = new Uint8Array(int16.buffer);
    const base64 = btoa(String.fromCharCode(...bytes));

    playback.enqueue(base64);

    expect(playback.playing).toBe(true);
    expect(postMessageMock).toHaveBeenCalledWith({
      type: 'enqueue',
      samples: expect.any(Float32Array),
    });

    playback.clear();

    expect(playback.playing).toBe(false);
    expect(playback.bufferedSeconds).toBe(0);
    expect(postMessageMock).toHaveBeenCalledWith({ type: 'clear' });
  });

  it('returns the enqueued duration in seconds', () => {
    (playback as any).workletNode = { port: { postMessage: vi.fn() }, disconnect: vi.fn() };
    // 4800 samples at 24kHz = 0.2s
    const int16 = new Int16Array(4800);
    const bytes = new Uint8Array(int16.buffer);
    const base64 = btoa(String.fromCharCode(...bytes));
    expect(playback.enqueue(base64)).toBeCloseTo(0.2, 5);
  });

  it('returns 0 when there is no worklet to enqueue into', () => {
    (playback as any).workletNode = null;
    const int16 = new Int16Array(2400);
    const bytes = new Uint8Array(int16.buffer);
    const base64 = btoa(String.fromCharCode(...bytes));
    expect(playback.enqueue(base64)).toBe(0);
  });

  it('immediately fires onDrained callback if not playing', () => {
    const cb = vi.fn();
    (playback as any)._playing = false;

    playback.onDrained(cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
