// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildPrompt,
  clozeSentence,
  decryptFrame,
  decryptPlan,
  intervalCode,
  logPacket,
  newDecryptSession,
  packetCode,
  signalBars,
  transmissionReport,
} from '../wiredMechanics/decrypt';

describe('decrypt motion plan', () => {
  it('runs ~1.5s in stepped frames at full motion', () => {
    const plan = decryptPlan('full', false);
    expect(plan.frames).toBeGreaterThan(1);
    expect(plan.frames * plan.frameMs).toBe(1500);
  });

  it('is instant under reduced motion and motion off', () => {
    expect(decryptPlan('full', true)).toEqual({ frames: 0, frameMs: 0 });
    expect(decryptPlan('off', false)).toEqual({ frames: 0, frameMs: 0 });
  });

  it('is a short burst on reduced motion level or battery saver', () => {
    expect(decryptPlan('reduced', false).frames).toBe(4);
    expect(decryptPlan('full', false, true).frames).toBe(4);
  });
});

describe('decrypt frames', () => {
  const text = '食べる こと。';

  it('returns plaintext immediately when there are no frames (reduced-motion path)', () => {
    expect(decryptFrame(text, 0, 0, 7)).toBe(text);
  });

  it('returns plaintext at the last frame and noise before it, keeping the shape', () => {
    expect(decryptFrame(text, 12, 12, 7)).toBe(text);
    const first = decryptFrame(text, 0, 12, 7);
    expect(first).not.toBe(text);
    expect([...first]).toHaveLength([...text].length);
    expect(first[3]).toBe(' ');
    expect(first.endsWith('。')).toBe(true);
  });

  it('locks characters in progressively', () => {
    const plain = [...text];
    const correct = (f: number) => [...decryptFrame(text, f, 12, 3)].filter((c, i) => c === plain[i]).length;
    expect(correct(11)).toBeGreaterThanOrEqual(correct(2));
  });
});

describe('channels', () => {
  const card = { id: '1', word: '雨', reading: 'あめ', meaning: 'rain', sentence: '雨が降る。' };

  it('forward shows the word, reverse the meaning, cloze the masked sentence', () => {
    expect(buildPrompt(card, 'forward')).toEqual({ prompt: '雨', promptIsTarget: true, channel: 'forward' });
    expect(buildPrompt(card, 'reverse')).toEqual({ prompt: 'rain', promptIsTarget: false, channel: 'reverse' });
    expect(buildPrompt(card, 'cloze')).toEqual({ prompt: '［＿＿］が降る。', promptIsTarget: true, channel: 'cloze' });
  });

  it('falls back to forward when the channel has nothing to show', () => {
    expect(buildPrompt({ id: '2', word: '猫' }, 'reverse').channel).toBe('forward');
    expect(buildPrompt({ id: '3', word: '猫', sentence: '犬がいる。' }, 'cloze').channel).toBe('forward');
    expect(clozeSentence('猫', '猫')).toBeNull();
  });
});

describe('packet log and report', () => {
  it('ACK builds signal, NAK drops it, peak is kept', () => {
    let s = newDecryptSession(0);
    s = logPacket(s, { word: 'a', rating: 'good', intervalDays: 3, at: 1 });
    s = logPacket(s, { word: 'b', rating: 'easy', intervalDays: 9, at: 2 });
    s = logPacket(s, { word: 'c', rating: 'hard', intervalDays: 1, at: 3 });
    expect(s.signal).toBe(3);
    s = logPacket(s, { word: 'd', rating: 'again', intervalDays: 0, at: 4 });
    expect(s.signal).toBe(0);
    expect(s.peakSignal).toBe(3);
    expect(s.packets.map((p) => p.kind)).toEqual(['ACK', 'ACK', 'ACK', 'NAK']);
    expect(s.packets.map((p) => p.seq)).toEqual([1, 2, 3, 4]);
    const report = transmissionReport(s, 65_000);
    expect(report).toEqual({ sent: 4, ack: 3, nak: 1, accuracy: 75, peakSignal: 3, elapsedSec: 65 });
  });

  it('formats codes and clamps the meter', () => {
    expect(packetCode(7)).toBe('#0007');
    expect(intervalCode(4)).toBe('+4d');
    expect(intervalCode(0.5)).toBe('+12h');
    expect(intervalCode(0.007)).toBe('+10m');
    expect(intervalCode(0)).toBe('+0m');
    expect(signalBars(25)).toBe(10);
    expect(signalBars(-1)).toBe(0);
  });
});
