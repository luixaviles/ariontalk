import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SileroVadDetector } from '../silero-vad-detector.js';

let mockMicVadNew: any;
let mockVadInstance: any;

vi.mock('@ricky0123/vad-web', () => ({
  MicVAD: {
    new: (...args: any[]) => mockMicVadNew(...args),
  },
}));

describe('SileroVadDetector', () => {
  let detector: SileroVadDetector;
  let mockTrack: any;
  let mockStream: any;

  beforeEach(() => {
    mockTrack = { stop: vi.fn() };
    mockStream = { getTracks: vi.fn().mockReturnValue([mockTrack]) };

    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
      configurable: true,
    });

    mockVadInstance = {
      start: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
    };

    mockMicVadNew = vi.fn().mockResolvedValue(mockVadInstance);
    detector = new SileroVadDetector();
  });

  afterEach(() => {
    detector.destroy();
    vi.restoreAllMocks();
  });

  it('init passes custom stream callbacks, constraints, and primes pipeline with start() and pause()', async () => {
    await detector.init();

    expect(mockMicVadNew).toHaveBeenCalledTimes(1);
    const opts = mockMicVadNew.mock.calls[0][0];

    expect(opts.startOnLoad).toBe(false);
    expect(typeof opts.getStream).toBe('function');
    expect(typeof opts.pauseStream).toBe('function');
    expect(typeof opts.resumeStream).toBe('function');

    // Test getStream uses exact constraints
    const stream = await opts.getStream();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: { channelCount: 1, echoCancellation: true, autoGainControl: true, noiseSuppression: true },
    });
    expect(stream).toBe(mockStream);

    // pauseStream is a no-op that does not stop tracks
    await opts.pauseStream();
    expect(mockTrack.stop).not.toHaveBeenCalled();

    // resumeStream returns stream
    const resumed = await opts.resumeStream(mockStream);
    expect(resumed).toBe(mockStream);

    // Primes the pipeline
    expect(mockVadInstance.start).toHaveBeenCalledTimes(1);
    expect(mockVadInstance.pause).toHaveBeenCalledTimes(1);
  });

  it('startMonitoring and stopMonitoring control vad start and pause', async () => {
    await detector.init();

    const onBargeIn = vi.fn();
    detector.startMonitoring(onBargeIn);
    expect(mockVadInstance.start).toHaveBeenCalledTimes(2); // 1 from init prime, 1 from startMonitoring

    detector.stopMonitoring();
    expect(mockVadInstance.pause).toHaveBeenCalledTimes(2); // 1 from init prime, 1 from stopMonitoring
  });

  it('onSpeechRealStart triggers callback only while monitoring', async () => {
    await detector.init();
    const opts = mockMicVadNew.mock.calls[0][0];

    const onBargeIn = vi.fn();

    // Not monitoring yet -> callback not called
    opts.onSpeechRealStart();
    expect(onBargeIn).not.toHaveBeenCalled();

    // Start monitoring -> callback called and monitoring reset
    detector.startMonitoring(onBargeIn);
    opts.onSpeechRealStart();
    expect(onBargeIn).toHaveBeenCalledTimes(1);

    // Second call without re-arming does not fire again
    opts.onSpeechRealStart();
    expect(onBargeIn).toHaveBeenCalledTimes(1);
  });

  it('destroy stops media tracks and destroys vad instance', async () => {
    await detector.init();
    const opts = mockMicVadNew.mock.calls[0][0];
    await opts.getStream();

    detector.destroy();

    expect(mockVadInstance.destroy).toHaveBeenCalledTimes(1);
    expect(mockTrack.stop).toHaveBeenCalledTimes(1);
  });

  it('init failure degrades gracefully without throwing', async () => {
    mockMicVadNew.mockRejectedValue(new Error('Permission denied'));
    const failDetector = new SileroVadDetector();

    await expect(failDetector.init()).resolves.toBeUndefined();
    expect(() => failDetector.startMonitoring(() => {})).not.toThrow();
    expect(() => failDetector.stopMonitoring()).not.toThrow();
    expect(() => failDetector.destroy()).not.toThrow();
  });

  it('failing start() during init destroys vad and stops stream tracks', async () => {
    mockMicVadNew.mockImplementation(async (opts: any) => {
      await opts.getStream();
      return mockVadInstance;
    });
    mockVadInstance.start.mockRejectedValue(new Error('AudioContext error'));
    const failDetector = new SileroVadDetector();

    await expect(failDetector.init()).resolves.toBeUndefined();
    expect(mockVadInstance.destroy).toHaveBeenCalled();
    expect(mockTrack.stop).toHaveBeenCalled();
  });
});
