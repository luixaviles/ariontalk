import type { SpeechSynthesizer, VoiceInfo } from '@ariontalk/core';
import { KokoroSynthesizer, listKokoroVoices, type KokoroTtsOptions, type KokoroLoadStatus } from './kokoro-synthesizer.js';

export interface TtsPlugin {
  id: string;
  label: string;
  tooltip?: string;
  voices?: VoiceInfo[];
  supports?: { rate?: boolean; pitch?: boolean; volume?: boolean };
  allowAutomaticVoice?: boolean;
  create: () => SpeechSynthesizer;
  preload?: (onProgress?: (loaded: number) => void) => Promise<void>;
  status?: () => KokoroLoadStatus;
  /** Side-effect-free support check. False renders the option disabled. */
  isSupported?: () => boolean;
  /** Shown under the Speech row when isSupported() returns false. */
  unsupportedReason?: string;
}

export function kokoroTtsPlugin(options?: KokoroTtsOptions): TtsPlugin {
  return {
    id: 'kokoro',
    label: 'Kokoro',
    tooltip: 'Higher-quality on-device voice. ~325MB download, requires WebGPU',
    voices: listKokoroVoices(options?.voices),
    supports: { rate: true, pitch: false, volume: true },
    allowAutomaticVoice: false,
    create: () => new KokoroSynthesizer(options),
    preload: (onProgress) => KokoroSynthesizer.preload(options, onProgress),
    status: () => KokoroSynthesizer.status(options),
    isSupported: () => KokoroSynthesizer.isSupported(options),
    unsupportedReason: "Kokoro needs WebGPU, which this browser doesn't support.",
  };
}
