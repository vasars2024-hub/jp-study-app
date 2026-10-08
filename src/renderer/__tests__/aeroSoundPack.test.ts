// @vitest-environment jsdom
/**
 * The Aero sound pack (audio/aeroProofPack.ts).
 *
 * The bug this guards: the environment beds were mapped to a 1.5 s cue with an
 * attack and a release, and `soundEngine.playLoop` loops its buffer — so the
 * "ambient" bed was a swell every 1.5 s. The bed must now be a long loop with
 * no envelope and a seam that does not click.
 */
import { describe, expect, it } from 'vitest';
import {
  AERO_AMBIENT_LOOP_SECONDS,
  AERO_SAMPLE_RATE,
  aeroCueBuffer,
  stereoWavDataUrl,
  type AeroCueId,
} from '../audio/aeroProofPack';

const ONE_SHOTS: AeroCueId[] = [
  'startup', 'shutdown', 'restart', 'sleep', 'wake', 'notify', 'balloon', 'info', 'warning',
  'error', 'criticalStop', 'confirm', 'cancel', 'dialog', 'menu', 'navigate', 'windowOpen',
  'windowClose', 'minimize', 'achievement', 'deviceConnect',
];

function rms(data: Float32Array, from: number, to: number): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / Math.max(1, to - from));
}

function peak(data: Float32Array): number {
  let max = 0;
  for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i]));
  return max;
}

describe('Aero sound pack', () => {
  it.each(ONE_SHOTS)('%s renders a stereo, non-silent, unclipped 44.1 kHz cue', (id) => {
    const buf = aeroCueBuffer(id);
    expect(buf.sampleRate).toBe(AERO_SAMPLE_RATE);
    expect(buf.left.length).toBe(buf.right.length);
    expect(buf.left.length).toBeGreaterThan(0.05 * AERO_SAMPLE_RATE);
    expect(peak(buf.left)).toBeGreaterThan(0.05);
    expect(Math.max(peak(buf.left), peak(buf.right))).toBeLessThanOrEqual(1);
    // It is stereo in more than name: the channels are not identical.
    let diff = 0;
    for (let i = 0; i < buf.left.length; i += 64) diff += Math.abs(buf.left[i] - buf.right[i]);
    if (id !== 'navigate') expect(diff).toBeGreaterThan(0);
  });

  it('the startup cue is a ~3.5 s swell', () => {
    const buf = aeroCueBuffer('startup');
    const seconds = buf.left.length / AERO_SAMPLE_RATE;
    expect(seconds).toBeGreaterThan(3);
    expect(seconds).toBeLessThan(5);
    // Rising: the second second is louder than the first quarter-second.
    expect(rms(buf.left, AERO_SAMPLE_RATE, 2 * AERO_SAMPLE_RATE)).toBeGreaterThan(
      rms(buf.left, 0, AERO_SAMPLE_RATE / 4),
    );
  });

  describe('ambient bed', () => {
    const bed = aeroCueBuffer('ambient');
    const n = bed.left.length;
    const sr = AERO_SAMPLE_RATE;

    it('is a long loop (8–12 s)', () => {
      expect(n).toBe(AERO_AMBIENT_LOOP_SECONDS * sr);
      expect(AERO_AMBIENT_LOOP_SECONDS).toBeGreaterThanOrEqual(8);
      expect(AERO_AMBIENT_LOOP_SECONDS).toBeLessThanOrEqual(12);
    });

    it('has no envelope: the ends are as loud as the middle', () => {
      const head = rms(bed.left, 0, sr / 2);
      const mid = rms(bed.left, n / 2 - sr / 4, n / 2 + sr / 4);
      const tail = rms(bed.left, n - sr / 2, n);
      expect(head).toBeGreaterThan(mid * 0.5);
      expect(tail).toBeGreaterThan(mid * 0.5);
      // MUTATION CONTROL: a faded loop would sit near silence at both ends.
      expect(head).toBeGreaterThan(0.01);
    });

    it('loops without a click at the seam', () => {
      // The jump from the last sample back to the first is no bigger than the
      // ordinary sample-to-sample movement inside the bed.
      let typical = 0;
      for (let i = 1; i < n; i++) typical = Math.max(typical, Math.abs(bed.left[i] - bed.left[i - 1]));
      for (const ch of [bed.left, bed.right]) {
        expect(Math.abs(ch[0] - ch[n - 1])).toBeLessThanOrEqual(typical);
      }
    });
  });

  it('encodes a 16-bit stereo WAV', () => {
    const url = stereoWavDataUrl(aeroCueBuffer('menu'));
    expect(url.startsWith('data:audio/wav;base64,UklGR')).toBe(true);
    const bytes = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
    expect(bytes.readUInt16LE(22)).toBe(2);
    expect(bytes.readUInt32LE(24)).toBe(AERO_SAMPLE_RATE);
    expect(bytes.readUInt16LE(34)).toBe(16);
  });
});
