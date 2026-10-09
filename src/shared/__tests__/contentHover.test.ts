// @vitest-environment node
/*
 * The hover dictionary, driven like a reader drives it: hold Shift, point at a
 * word, read the popup. Each block pins one of the verified bugs of the
 * 2026-10 extension audit (bug numbers in the test names).
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fakeScan, loadContent, warmContentDom, type ContentHarness } from './contentHarness';

const WORDS = {
  私: { reading: 'わたし', senses: [{ partsOfSpeech: ['pronoun'], definitions: ['I; me'] }] },
  猫: { reading: 'ねこ', senses: [{ partsOfSpeech: ['noun'], definitions: ['cat'] }] },
  きのう: { reading: 'きのう', senses: [{ partsOfSpeech: ['noun'], definitions: ['yesterday'] }] },
  学校: { reading: 'がっこう', senses: [{ partsOfSpeech: ['noun'], definitions: ['school'] }] },
  漢字: { reading: 'かんじ', senses: [{ partsOfSpeech: ['noun'], definitions: ['kanji'] }] },
};

let h: ContentHarness | null = null;

beforeAll(() => warmContentDom(), 60_000);
afterEach(() => {
  h?.dispose();
  h = null;
});

function textNode(page: ContentHarness, id: string): Text {
  const el = page.document.getElementById(id);
  if (!el || !el.firstChild) throw new Error(`no text in #${id}`);
  return el.firstChild as Text;
}

describe('hover engine — one batched scan, short words found (bug 1, WP1)', () => {
  it('finds a one-character word at the start of a long window: 私', async () => {
    h = await loadContent({ html: '<p id="p">私はきのう学校へ行きました。</p>', reply: fakeScan(WORDS) });
    h.hover(textNode(h, 'p'), 0);
    await h.waitFor(() => h!.popup());
    expect(h.popupTerm()).toBe('私');
    const scans = h.sent.filter((m) => m.type === 'scan');
    // One request per pointer position — every prefix is answered by the app in one read.
    expect(new Set(scans.map((m) => m.text)).size).toBe(1);
    expect(String(scans[0].text).startsWith('私はきのう')).toBe(true);
    expect(h.sent.some((m) => m.type === 'lookup')).toBe(false);
  });

  it('finds 猫 in 猫が好きです', async () => {
    h = await loadContent({ html: '<p id="p">猫が好きです。</p>', reply: fakeScan(WORDS) });
    h.hover(textNode(h, 'p'), 0);
    await h.waitFor(() => h!.popup());
    expect(h.popupTerm()).toBe('猫');
  });

  it('ignores prefix and fuzzy near misses (bug 17)', async () => {
    h = await loadContent({
      html: '<p id="p">猫舌です</p>',
      reply: (msg) =>
        msg.type === 'scan'
          ? { ok: true, matched: '猫', entries: [{ word: '猫舌', via: 'prefix', senses: [] }] }
          : undefined,
    });
    h.hover(textNode(h, 'p'), 0);
    await new Promise((r) => setTimeout(r, 120));
    expect(h.popup()).toBeNull();
  });
});

describe('hover engine — latest pointer wins (bug 7)', () => {
  it('a slow answer for the word the pointer left never replaces the newer one', async () => {
    h = await loadContent({
      html: '<p id="a">猫です</p><p id="b">学校です</p>',
      reply: fakeScan(WORDS),
      delayMs: (msg) => (String(msg.text).startsWith('猫') ? 80 : 5),
    });
    h.hover(textNode(h, 'a'), 0);
    await new Promise((r) => setTimeout(r, 50)); // 猫's scan is in flight
    h.hover(textNode(h, 'b'), 0);
    await h.waitFor(() => h!.popupTerm() === '学校');
    await new Promise((r) => setTimeout(r, 120)); // the late 猫 answer arrives
    expect(h.popupTerm()).toBe('学校');
    // The newer hover was looked up, not dropped while the first was busy.
    expect(h.sent.filter((m) => m.type === 'scan').map((m) => String(m.text)[0])).toContain('学');
  });
});

describe('hover engine — the character under the pointer, not the caret after it', () => {
  // Each character is a 20 px box on one line: 猫 0–20, と 20–40, 学 40–60, 校 60–80.
  // The harness points at x=50, y=50 — inside 学.
  const glyphBoxes = (win: Window & typeof globalThis & Record<string, unknown>): void => {
    (win.Range.prototype as unknown as { getClientRects: () => unknown[] }).getClientRects = function (this: Range) {
      const i = this.startOffset;
      return [{ left: i * 20, right: i * 20 + 20, top: 40, bottom: 60 }];
    };
  };

  it('over the right half of a glyph, the browser caret is after it: still looks up that glyph', async () => {
    // Measured live in Chrome 2026-10-08: the right half of 猫 in 猫と looked up と.
    h = await loadContent({ html: '<p id="p">猫と学校</p>', reply: fakeScan(WORDS), beforeScripts: glyphBoxes });
    h.hover(textNode(h, 'p'), 3); // the caret Chrome reports: after 学
    await h.waitFor(() => h!.popup());
    expect(h.popupTerm()).toBe('学校');
  });

  it('a caret that already sits on the hovered glyph is kept', async () => {
    h = await loadContent({ html: '<p id="p">猫と学校</p>', reply: fakeScan(WORDS), beforeScripts: glyphBoxes });
    h.hover(textNode(h, 'p'), 2);
    await h.waitFor(() => h!.popup());
    expect(h.popupTerm()).toBe('学校');
  });
});

describe('hover engine — forced click path (bug 8)', () => {
  it('key + click looks up even with hover lookup switched off', async () => {
    h = await loadContent({
      html: '<p id="p">学校へ行く</p>',
      reply: fakeScan(WORDS),
      settings: { version: 3, hoverLookup: false },
    });
    h.click(textNode(h, 'p'), 0);
    await h.waitFor(() => h!.popup());
    expect(h.popupTerm()).toBe('学校');
  });
});

describe('popup — dictionary HTML cannot run script (bug 2, WP2)', () => {
  it('strips handlers, javascript: URLs and script elements from glossary and pitch markup', async () => {
    const evil =
      '<img src=x onerror="alert(1)"><a href="javascript:alert(2)">link</a><b onclick="alert(3)">bold</b>' +
      '<script>alert(4)</script><span style="background:url(javascript:alert(5))">s</span>';
    h = await loadContent({
      html: '<p id="p">猫だ</p>',
      reply: (msg) =>
        msg.type === 'scan'
          ? {
              ok: true,
              matched: '猫',
              entries: [{ word: '猫', reading: 'ねこ', via: 'exact', glossaryHtml: evil, pitchHtml: '<span onmouseover="x()">ね</span>' }],
            }
          : undefined,
    });
    h.hover(textNode(h, 'p'), 0);
    const popup = await h.waitFor(() => h!.popup());
    const html = popup.innerHTML;
    expect(popup.querySelector('img, script, a, iframe')).toBeNull();
    expect(html).not.toMatch(/\son\w+=/i);
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toMatch(/url\(/i);
    expect(popup.textContent).toContain('bold');
    expect(popup.textContent).toContain('link');
  });
});

describe('popup — pitch accent number', () => {
  it('reads the downstep from the app\'s pitch markup', async () => {
    const hi = 'border-top:2px solid currentColor;padding-top:1px;display:inline-block';
    const lo = 'display:inline-block';
    h = await loadContent({
      html: '<p id="p">学校へ</p>',
      reply: (msg) =>
        msg.type === 'scan'
          ? {
              ok: true,
              matched: '学校',
              entries: [
                {
                  word: '学校',
                  reading: 'がっこう',
                  via: 'exact',
                  pitchHtml: `<span style="${lo}">が</span><span style="${hi}">っ</span><span style="${hi}">こ</span><span style="${hi}">う</span>`,
                },
              ],
            }
          : undefined,
    });
    h.hover(textNode(h, 'p'), 0);
    const popup = await h.waitFor(() => h!.popup());
    expect(popup.querySelector('.rp-pitch-num')?.textContent).toBe('[0]');
  });
});

describe('page integrity (bugs 9, 10, 16)', () => {
  it('leaves the page DOM untouched after a hover and marks the word with a Highlight', async () => {
    h = await loadContent({ html: '<p id="p">私はきのう学校へ行きました。</p>', reply: fakeScan(WORDS) });
    const before = h.document.body.innerHTML;
    h.hover(textNode(h, 'p'), 5);
    await h.waitFor(() => h!.popup());
    expect(h.document.body.innerHTML).toBe(before);
    expect(h.document.querySelector('mark')).toBeNull();
    expect(h.highlights().has('gum-lookup')).toBe(true);
  });

  it('does not take the page\'s keys while the hover key is released', async () => {
    h = await loadContent({ html: '<p id="p">猫が好き</p>', reply: fakeScan(WORDS) });
    h.hover(textNode(h, 'p'), 0);
    await h.waitFor(() => h!.popup());
    h.keyUp('Shift');
    for (const key of ['s', 'c', 'p', 'a', 'Backspace', 'ArrowLeft', 'ArrowRight']) {
      const ev = h.keyDown(key);
      expect({ key, prevented: ev.defaultPrevented }).toEqual({ key, prevented: false });
    }
    expect(h.sent.some((m) => m.type === 'save-text')).toBe(false);
  });

  it('a hover on furigana looks up the base text, not the reading', async () => {
    h = await loadContent({
      html: '<p id="p"><ruby>漢字<rt id="rt">かんじ</rt></ruby>を書く</p>',
      reply: fakeScan(WORDS),
    });
    h.hover(textNode(h, 'rt'), 1);
    await h.waitFor(() => h!.popup());
    expect(h.popupTerm()).toBe('漢字');
  });
});

describe('rich mining payload (bug 5, WP4)', () => {
  it('Save word sends the sentence, the entry reading and gloss, and the lemma', async () => {
    h = await loadContent({ html: '<p id="p">昨日、猫が庭で寝ていた。</p>', reply: fakeScan(WORDS) });
    const node = textNode(h, 'p');
    h.hover(node, 3);
    await h.waitFor(() => h!.popupTerm() === '猫');
    const btn = h.popup()?.querySelector('[data-act="save-word"]') as HTMLElement;
    btn.click();
    const save = await h.waitFor(() => h!.sent.find((m) => m.type === 'save-text'));
    expect(save).toMatchObject({
      text: '猫',
      mode: 'word',
      sentence: '昨日、猫が庭で寝ていた。',
      reading: 'ねこ',
      meaning: 'cat',
      lemma: '猫',
      entryIndex: 0,
    });
  });
});

describe('hover latency (WP1 target < 50 ms perceived)', () => {
  it('measures mousemove → popup with a 5 ms app', async () => {
    const results: Record<string, number> = {};
    for (const delay of [0, 40]) {
      const page = await loadContent({
        html: '<p id="p">私はきのう学校へ行きました。</p>',
        reply: fakeScan(WORDS),
        delayMs: () => 5,
        settings: { version: 3, hoverDelayMs: delay },
      });
      const samples: number[] = [];
      for (let i = 0; i < 5; i++) {
        const node = textNode(page, 'p');
        const t0 = performance.now();
        const offset = i % 2 === 0 ? 0 : 5; // 私 / 学校, so every sample is a new word
        const expected = offset === 0 ? '私' : '学校';
        page.hover(node, offset, { holdKey: i === 0 });
        await page.waitFor(() => page.popup() && page.popupTerm() === expected);
        samples.push(performance.now() - t0);
        page.popup()?.classList.remove('open');
      }
      results[`hoverDelay=${delay}ms`] = Math.round(samples.sort((a, b) => a - b)[2]);
      page.dispose();
    }
    // Printed for the report; asserted loosely because CI machines vary.
    console.log('[hover latency, median of 5, 5 ms app]', JSON.stringify(results));
    expect(results['hoverDelay=0ms']).toBeLessThan(60);
  });
});
