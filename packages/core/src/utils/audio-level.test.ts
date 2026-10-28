import { describe, it, expect } from 'vitest';
import {
  FLOOR_DB,
  CEIL_DB,
  rmsToLevel,
  analyserRms,
  micErrorKind,
  type AnalyserScratch,
} from './audio-level.js';

describe('audio-level utilities', () => {
  it('exposes FLOOR_DB = -50 and CEIL_DB = -10', () => {
    expect(FLOOR_DB).toBe(-50);
    expect(CEIL_DB).toBe(-10);
  });

  it('maps silence (0), -50 dB (0), -30 dB (0.5), -10 dB (1), and above full scale (1)', () => {
    expect(rmsToLevel(0)).toBe(0);
    expect(rmsToLevel(Math.pow(10, -50 / 20))).toBeCloseTo(0, 6);
    expect(rmsToLevel(Math.pow(10, -30 / 20))).toBeCloseTo(0.5, 6);
    expect(rmsToLevel(Math.pow(10, -10 / 20))).toBeCloseTo(1, 6);
    expect(rmsToLevel(1.5)).toBe(1);
  });

  it('computes RMS from float and byte time-domain analysers using scratch buffers', () => {
    const scratch: AnalyserScratch = {};
    const floatAnalyser = {
      fftSize: 64,
      getFloatTimeDomainData: (arr: Float32Array<ArrayBuffer>) => {
        arr.fill(0.25);
      },
    };
    expect(analyserRms(floatAnalyser, scratch)).toBeCloseTo(0.25, 5);
    expect(scratch.float?.length).toBe(64);

    const byteAnalyser = {
      fftSize: 64,
      getByteTimeDomainData: (arr: Uint8Array<ArrayBuffer>) => {
        arr.fill(192); // (192 - 128) / 128 = 0.5
      },
    };
    expect(analyserRms(byteAnalyser, scratch)).toBeCloseTo(0.5, 5);
    expect(scratch.byte?.length).toBe(64);
  });

  it('classifies getUserMedia errors with micErrorKind', () => {
    expect(micErrorKind({ name: 'NotAllowedError' })).toBe('blocked');
    expect(micErrorKind({ name: 'PermissionDeniedError' })).toBe('blocked');
    expect(micErrorKind({ name: 'NotFoundError' })).toBe('not-found');
    expect(micErrorKind({ name: 'DevicesNotFoundError' })).toBe('not-found');
    expect(micErrorKind({ name: 'AbortError' })).toBeNull();
    expect(micErrorKind(null)).toBeNull();
  });
});
