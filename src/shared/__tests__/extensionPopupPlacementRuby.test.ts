// @vitest-environment node
/*
 * Two defects from the 2026-10 hardware run of the browser extension:
 *  - furigana sat over the okurigana too (のみ spread across 飲み): the ruby must
 *    annotate the kanji only;
 *  - in a short window (805 px) the dictionary popup was clamped to the top edge
 *    and covered the hovered word: placement must keep the word visible,
 *    shrinking the popup when neither side has room for all of it.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadContent, warmContentDom, type ContentHarness } from './contentHarness';

let h: ContentHarness | null = null;

beforeAll(() => warmContentDom(), 60_000);
afterEach(() => {
  h?.dispose();
  h = null;
});

const ORIGIN = 'https://news.example.jp';

type Plan = {
  side: 'below' | 'above';
  left: number;
  width: number;
  maxHeight: number;
  top: number | null;
  bottom: number | null;
};
type Planner = (args: {
  anchor: { left: number; right: number; top: number; bottom: number };
  viewportWidth: number;
  viewportHeight: number;
  width: number;
  naturalHeight: number;
  maxCap: number;
}) => Plan;
type Segments = (surface: string, reading: string) => Array<{ text: string; reading?: string }> | null;

async function hooks() {
  h = await loadContent({ html: '<p>テスト</p>' });
  const all = h.hooks();
  return { plan: all.planPopupPlacement as Planner, segments: all.rubySegments as Segments };
}

/** The popup's box on screen, from a plan. */
function box(plan: Plan, viewportHeight: number, height: number) {
  const shown = Math.min(height, plan.maxHeight);
  const top = plan.top ?? viewportHeight - (plan.bottom as number) - shown;
  return { top, bottom: top + shown };
}

describe('furigana sits on the kanji only', () => {
  it('splits trailing okurigana off the reading: 飲み + のみ', async () => {
    const { segments } = await hooks();
    expect(segments('飲み', 'のみ')).toEqual([{ text: '飲', reading: 'の' }, { text: 'み' }]);
    expect(segments('食べる', 'タベル')).toEqual([{ text: '食', reading: 'た' }, { text: 'べる' }]);
  });

  it('handles leading kana, kana between kanji, and plain kanji words', async () => {
    const { segments } = await hooks();
    expect(segments('お茶', 'おちゃ')).toEqual([{ text: 'お' }, { text: '茶', reading: 'ちゃ' }]);
    expect(segments('話し合う', 'はなしあう')).toEqual([
      { text: '話', reading: 'はな' },
      { text: 'し' },
      { text: '合', reading: 'あ' },
      { text: 'う' },
    ]);
    expect(segments('学校', 'がっこう')).toEqual([{ text: '学校', reading: 'がっこう' }]);
    expect(segments('一ヶ月', 'いっかげつ')).toEqual([{ text: '一ヶ月', reading: 'いっかげつ' }]);
  });

  it('gives no ruby to a kana-only word, and the whole word when the reading does not fit', async () => {
    const { segments } = await hooks();
    expect(segments('ねこ', 'ねこ')).toBeNull();
    expect(segments('今日は', 'きょうわ')).toEqual([{ text: '今日は', reading: 'きょうわ' }]);
  });

  it('writes one ruby whose okurigana carries an empty annotation, and keeps the text', async () => {
    h = await loadContent({
      html: '<p id="a">毎朝コーヒーを飲みます。</p>',
      reply: (msg) => {
        if (msg.type !== 'annotate') return undefined;
        const texts = msg.texts as string[];
        return {
          ok: true,
          results: texts.map((text) => {
            const at = text.indexOf('飲み');
            return at >= 0 ? [{ o: at, n: 2, l: '飲む', k: 0, r: 'のみ' }] : [];
          }),
        };
      },
      settings: { version: 3, furigana: true },
      storage: { [`jpLearn:${ORIGIN}`]: true },
    });
    const ruby = await h.waitFor(() => h!.document.querySelector('ruby[data-gum-ruby]'));
    expect(ruby.innerHTML).toBe('飲<rt>の</rt>み<rt></rt>');
    const plain = h.document.getElementById('a')!.cloneNode(true) as HTMLElement;
    plain.querySelectorAll('rt').forEach((rt) => rt.remove());
    expect(plain.textContent).toBe('毎朝コーヒーを飲みます。');
    // The whole word is still coloured as new, base by base.
    await h.waitFor(() => {
      const hl = h!.highlights().get('gum-wk-0') as { ranges: Range[] } | undefined;
      return (hl?.ranges ?? []).map((r) => r.toString()).join('') === '飲み';
    });
  });
});

describe('popup placement keeps the hovered word visible', () => {
  const vw = 1280;

  it('goes below the word when it fits', async () => {
    const { plan } = await hooks();
    const word = { left: 100, right: 140, top: 100, bottom: 124 };
    const p = plan({ anchor: word, viewportWidth: vw, viewportHeight: 900, width: 360, naturalHeight: 400, maxCap: 560 });
    expect(p.side).toBe('below');
    expect(p.top).toBe(130);
    expect(box(p, 900, 400).bottom).toBeLessThanOrEqual(900);
  });

  it('flips above, anchored by its bottom edge, when only the space above is enough', async () => {
    const { plan } = await hooks();
    const word = { left: 100, right: 140, top: 700, bottom: 724 };
    const p = plan({ anchor: word, viewportWidth: vw, viewportHeight: 805, width: 360, naturalHeight: 420, maxCap: 560 });
    expect(p.side).toBe('above');
    expect(p.top).toBeNull();
    const b = box(p, 805, 420);
    expect(b.bottom).toBeLessThanOrEqual(word.top);
    expect(b.top).toBeGreaterThanOrEqual(0);
  });

  it('in an 805 px window with the word mid-screen, shrinks instead of covering the word', async () => {
    const { plan } = await hooks();
    // The hardware case: a 560 px popup, 340 px of room below and 360 above.
    const word = { left: 400, right: 440, top: 380, bottom: 404 };
    const p = plan({ anchor: word, viewportWidth: vw, viewportHeight: 805, width: 360, naturalHeight: 560, maxCap: 560 });
    const b = box(p, 805, 560);
    const coversWord = b.top < word.bottom && b.bottom > word.top;
    expect(coversWord).toBe(false);
    expect(p.maxHeight).toBeLessThan(560);
    expect(b.top).toBeGreaterThanOrEqual(0);
    expect(b.bottom).toBeLessThanOrEqual(805);
  });

  it('keeps the popup inside the viewport horizontally', async () => {
    const { plan } = await hooks();
    const word = { left: 1250, right: 1270, top: 100, bottom: 124 };
    const p = plan({ anchor: word, viewportWidth: vw, viewportHeight: 805, width: 360, naturalHeight: 300, maxCap: 560 });
    expect(p.left + p.width).toBeLessThanOrEqual(vw - 8);
    expect(p.left).toBeGreaterThanOrEqual(8);
  });
});
