export const FLOOR_DB = -50;
export const CEIL_DB = -10;

const DEFAULT_FFT_SIZE = 256;

export interface AnalyserScratch {
  float?: Float32Array<ArrayBuffer> | null;
  byte?: Uint8Array<ArrayBuffer> | null;
}

export interface TimeDomainAnalyser {
  fftSize?: number;
  getFloatTimeDomainData?: (array: Float32Array<ArrayBuffer>) => void;
  getByteTimeDomainData?: (array: Uint8Array<ArrayBuffer>) => void;
}

/**
 * Maps a linear time-domain RMS value to a perceptual 0..1 level over
 * [FLOOR_DB, CEIL_DB].
 */
export function rmsToLevel(rms: number): number {
  const safeRms = Number.isFinite(rms) ? Math.max(rms, 1e-8) : 1e-8;
  const db = 20 * Math.log10(safeRms);
  const level = (db - FLOOR_DB) / (CEIL_DB - FLOOR_DB);
  return Math.max(0, Math.min(1, level));
}

/**
 * Reads time-domain samples from an AnalyserNode into reusable scratch buffers
 * and returns the raw linear RMS.
 */
export function analyserRms(
  analyser: TimeDomainAnalyser,
  scratch: AnalyserScratch,
): number {
  const size = analyser.fftSize || DEFAULT_FFT_SIZE;

  if (typeof analyser.getFloatTimeDomainData === 'function') {
    if (!scratch.float || scratch.float.length !== size) {
      scratch.float = new Float32Array(size);
    }
    analyser.getFloatTimeDomainData(scratch.float);
    let sum = 0;
    for (let i = 0; i < scratch.float.length; i++) {
      const s = scratch.float[i];
      sum += s * s;
    }
    return Math.sqrt(sum / scratch.float.length);
  }

  if (typeof analyser.getByteTimeDomainData === 'function') {
    if (!scratch.byte || scratch.byte.length !== size) {
      scratch.byte = new Uint8Array(size);
    }
    analyser.getByteTimeDomainData(scratch.byte);
    let sum = 0;
    for (let i = 0; i < scratch.byte.length; i++) {
      const s = (scratch.byte[i] - 128) / 128;
      sum += s * s;
    }
    return Math.sqrt(sum / scratch.byte.length);
  }

  return 0;
}

/**
 * Classifies a `getUserMedia` rejection error into `'blocked'` or `'not-found'`,
 * or `null` for any other error.
 */
export function micErrorKind(err: unknown): 'blocked' | 'not-found' | null {
  const name = (err as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'blocked';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'not-found';
  }
  return null;
}
