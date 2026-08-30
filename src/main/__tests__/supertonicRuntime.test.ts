import { describe, expect, it } from 'vitest';
import { encodePcmWav } from '../supertonicRuntime';

describe('Supertonic PCM output', () => {
  it('writes a playable mono 16-bit WAV and clamps out-of-range samples', () => {
    const wav = encodePcmWav(Float32Array.from([-2, -0.5, 0, 0.5, 2]), 44_100);
    expect(wav.subarray(0, 4).toString()).toBe('RIFF');
    expect(wav.subarray(8, 12).toString()).toBe('WAVE');
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(44_100);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.readUInt32LE(40)).toBe(10);
    expect(wav.readInt16LE(44)).toBe(-32_767);
    expect(wav.readInt16LE(52)).toBe(32_767);
  });
});
