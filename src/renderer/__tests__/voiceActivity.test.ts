// @vitest-environment node
/**
 * The hands-free loop's decision (components/speak/voiceActivity.ts), on
 * synthetic levels: speech starts after a sustained rise, ends after the pause,
 * a short burst is discarded, a steady room noise is learned rather than taken
 * for speech, and the partner's voice leaking in does not interrupt itself
 * unless the learner really speaks over it.
 */
import { describe, expect, it } from 'vitest';
import { EnergyVad, rmsLevel } from '../components/speak/voiceActivity';

const FRAME = 40;

function run(vad: EnergyVad, levels: Array<[number, number]>, bargeIn = false): string[] {
  const events: string[] = [];
  for (const [level, ms] of levels) {
    for (let t = 0; t < ms; t += FRAME) {
      const event = vad.feed(level, FRAME, bargeIn);
      if (event) events.push(event);
    }
  }
  return events;
}

describe('EnergyVad', () => {
  it('a sentence followed by a pause is one utterance', () => {
    const vad = new EnergyVad();
    expect(run(vad, [[0.003, 1000], [0.08, 1500], [0.003, 1200]])).toEqual(['speech-start', 'speech-end']);
    expect(vad.speaking).toBe(false);
  });

  it('a short pause between words does not end it', () => {
    const vad = new EnergyVad();
    expect(run(vad, [[0.003, 500], [0.08, 600], [0.003, 400], [0.08, 600]])).toEqual(['speech-start']);
    expect(vad.speaking).toBe(true);
  });

  it('a click or a cough is discarded, never sent', () => {
    const vad = new EnergyVad();
    expect(run(vad, [[0.003, 500], [0.2, 160], [0.003, 1200]])).toEqual(['speech-start', 'speech-discard']);
  });

  it('a too-brief spike does not even start', () => {
    const vad = new EnergyVad();
    expect(run(vad, [[0.003, 500], [0.2, 80], [0.003, 500]])).toEqual([]);
  });

  it('a steady room noise is learned as the floor, so speech is judged against it', () => {
    const vad = new EnergyVad();
    // A fan at 0.006: just under the absolute start, learned over time.
    expect(run(vad, [[0.006, 5000]])).toEqual([]);
    expect(vad.floor).toBeGreaterThan(0.005);
    expect(run(vad, [[0.06, 800], [0.006, 1200]])).toEqual(['speech-start', 'speech-end']);
  });

  it('a long monologue is cut at the maximum and sent', () => {
    const vad = new EnergyVad({ maxSpeechMs: 2000 });
    expect(run(vad, [[0.003, 300], [0.08, 2600]])).toEqual(['speech-start', 'speech-end', 'speech-start']);
  });

  it('barge-in: the partner leaking into the mic does not interrupt, the learner speaking over it does', () => {
    const vad = new EnergyVad();
    run(vad, [[0.003, 1000]]);
    expect(run(vad, [[0.025, 1500]], true)).toEqual([]);
    expect(run(vad, [[0.12, 400]], true)).toEqual(['speech-start']);
  });
});

describe('rmsLevel', () => {
  it('is the root-mean-square of the window', () => {
    expect(rmsLevel(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5);
    expect(rmsLevel(new Float32Array(0))).toBe(0);
  });
});
