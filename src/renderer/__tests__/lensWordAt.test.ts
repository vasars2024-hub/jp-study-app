import { describe, expect, it } from 'vitest';
import { pickLensWordAt, type LensWordLine } from '../components/lens/lensWordAt';

const line = (text: string, box: [number, number, number, number], surfaces: string[], vertical = false): LensWordLine => ({
  text,
  box,
  vertical,
  tokens: surfaces.map((surface) => ({ surface })),
});

describe('pickLensWordAt — the word under the cursor', () => {
  // 6 characters across 120 px: 20 px each.
  const ja = line('猫が寝ている', [0, 0, 120, 20], ['猫', 'が', '寝', 'て', 'いる']);

  it('maps the pointer along the line onto its token', () => {
    expect(pickLensWordAt([ja], { x: 5, y: 10 })?.token.surface).toBe('猫');
    expect(pickLensWordAt([ja], { x: 45, y: 10 })?.token.surface).toBe('寝');
    expect(pickLensWordAt([ja], { x: 110, y: 10 })?.token.surface).toBe('いる');
  });

  it('reads a vertical line top to bottom', () => {
    const v = line('猫が寝る', [0, 0, 20, 80], ['猫', 'が', '寝る'], true);
    expect(pickLensWordAt([v], { x: 10, y: 50 })?.token.surface).toBe('寝る');
  });

  it('picks the nearer of two lines, and nothing when the pointer is far from text', () => {
    const second = line('犬です', [0, 40, 60, 20], ['犬', 'です']);
    expect(pickLensWordAt([ja, second], { x: 5, y: 45 })?.token.surface).toBe('犬');
    expect(pickLensWordAt([ja, second], { x: 400, y: 400 })).toBeNull();
  });

  it('steps off punctuation onto the nearest word', () => {
    const p = line('猫。犬', [0, 0, 60, 20], ['猫', '。', '犬']);
    expect(['猫', '犬']).toContain(pickLensWordAt([p], { x: 30, y: 10 })?.token.surface);
  });

  it('works for Russian words on a proportional line', () => {
    const ru = line('я читаю книгу', [0, 0, 130, 20], ['я', ' ', 'читаю', ' ', 'книгу']);
    expect(pickLensWordAt([ru], { x: 50, y: 10 })?.token.surface).toBe('читаю');
    expect(pickLensWordAt([ru], { x: 125, y: 10 })?.token.surface).toBe('книгу');
  });
});
