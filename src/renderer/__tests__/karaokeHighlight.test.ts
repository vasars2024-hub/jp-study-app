// @vitest-environment jsdom
/**
 * Per-word karaoke over a tokenised lyric line: the "still to come" range starts after
 * the sung characters, counting neither whitespace nor furigana (`<rt>`), so LRC word
 * lengths line up with ruby-annotated tokens.
 */
import { describe, expect, it } from 'vitest';
import { karaokeAheadRange, karaokeCharCount } from '../components/music/karaokeHighlight';

function line(html: string): HTMLElement {
  const el = document.createElement('span');
  el.innerHTML = html;
  document.body.append(el);
  return el;
}

describe('karaokeAheadRange', () => {
  it('starts after the sung characters, skipping furigana', () => {
    const el = line('<ruby><span>雨</span><rt>あめ</rt></ruby><span>が</span><ruby><span>降</span><rt>ふ</rt></ruby><span>る</span>');
    const range = karaokeAheadRange(el, 2)!;
    expect(range.startContainer.textContent).toBe('降');
    expect(range.startOffset).toBe(0);
    expect(range.toString()).toBe('降ふる');
  });

  it('ignores whitespace between Latin words, and is null once everything is sung', () => {
    const el = line('<span>Hello</span> <span>world</span>');
    expect(karaokeCharCount('Hello ')).toBe(5);
    expect(karaokeAheadRange(el, 5)?.toString()).toBe('world');
    expect(karaokeAheadRange(el, 10)).toBeNull();
    expect(karaokeAheadRange(el, 0)?.toString()).toBe('Hello world');
  });
});
