// @vitest-environment jsdom
/**
 * The transcript rail carries dialogue, and says how much it is withholding.
 *
 * THE DEFECT (S6, measured 2026-09-03 from the media file rather than from the app): the
 * rail renders every ASS `Dialogue:` line, signs included. On the app's own live clip that
 * is 3,056 lines of which **430** are `Default` and **2,626** are positioned typesetting —
 * so ~86 % of the column a learner scrolls is not speech, every one of those rows is
 * tokenized and mined from like a sentence, and it is six times the DOM that S5's
 * per-boundary band work is paid on.
 *
 * `VideoCoreActiveCue` has no `style` field, so the fix classifies the RAW cue text instead.
 * The offline census (`debug/_pri-s6-census.cjs`) is the accuracy evidence — 100 % recall,
 * 430 kept, and the 116 nominal false positives are exactly the OP/ED karaoke and Title
 * styles. These cases guard the WIRING, which is what that census could not reach:
 *
 *   1. signs are filtered by default, and the control brings them back;
 *   2. the rail states its own number rather than silently shrinking;
 *   3. an SRT track is untouched, and shows no control at all — the safe default;
 *   4. the emphasis bands survive the filter, which is the half most likely to rot. They
 *      are measured in RAIL POSITIONS, not cue indices: after filtering, consecutive spoken
 *      lines sit ~7 cue indices apart, and `rowDistance`'s ±1 `near` / ±4 `mid` would score
 *      every neighbour `far`, collapsing the S5 hierarchy to "the active row and nothing".
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import VideoCoreTranscriptPanel from '../../media/VideoCoreTranscriptPanel';
import { isTypesettingCueText } from '../../shared/videoCoreStudy';

/**
 * Ten spoken lines interleaved with typesetting, in the shape the real track has: the sign
 * lines carry `\pos` / `\move` / `\clip` / drawing mode, the dialogue lines carry nothing or
 * an ordinary italic. Cue indices are the ARRAY positions, exactly as the supply builds them.
 */
const MIXED = [
  '{\\pos(640,50)\\fscx120}看板',
  'セリフ0です。',
  '{\\move(100,100,200,200)}標識',
  'セリフ1です。',
  '{\\p1}m 0 0 l 100 0 l 100 50',
  'セリフ2です。',
  '{\\clip(0,0,640,360)}掲示',
  '{\\i1}セリフ3です。',
  '{\\an8\\fad(150,150)}字幕装飾',
  'セリフ4です。',
  '{\\frz30}回転看板',
  'セリフ5です。',
  '{\\org(320,180)}原点指定',
  'セリフ6です。',
  '{\\pos(1,1)}別の看板',
  'セリフ7です。',
  '{\\iclip(m 0 0 l 5 5)}切り抜き',
  'セリフ8です。',
  '{\\t(0,500,\\fscx150)}変形',
  'セリフ9です。',
].map((text, index) => ({
  index,
  trackNumber: 1,
  text,
  startMs: 10_000 + index * 1_000,
  endMs: 10_900 + index * 1_000,
}));

/** An SRT track: real cues, zero override tags anywhere. */
const SRT = Array.from({ length: 6 }, (_, i) => ({
  index: i,
  trackNumber: 1,
  text: `セリフ${i}です。`,
  startMs: 10_000 + i * 2_000,
  endMs: 11_000 + i * 2_000,
}));

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

const noop = (): void => undefined;

async function mountPanel(
  cues: readonly (typeof MIXED)[number][],
  activeIndex: number | null,
): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <VideoCoreTranscriptPanel
        cues={cues}
        activeIndex={activeIndex}
        lang="ja"
        trackLabel="Japanese"
        onSeek={noop}
        onClose={noop}
      />,
    );
  });
  return host;
}

function texts(host: HTMLElement): string[] {
  return [...host.querySelectorAll('.study-transcript-text')].map((n) => n.textContent ?? '');
}

function signsToggle(host: HTMLElement): HTMLInputElement | null {
  return host.querySelector('[data-study-action="transcript-show-signs"]');
}

describe('isTypesettingCueText', () => {
  it('flags every positioning, drawing and transform override the census counted', () => {
    // One case per alternative in the classifier, so a narrowed regex fails here loudly
    // rather than quietly restoring 2,626 rows.
    for (const raw of MIXED.filter((_, i) => i % 2 === 0).map((c) => c.text)) {
      expect(isTypesettingCueText(raw), raw).toBe(true);
    }
  });

  it('leaves speech alone, including an italic and a plain SRT line', () => {
    expect(isTypesettingCueText('セリフ0です。')).toBe(false);
    expect(isTypesettingCueText('{\\i1}セリフ3です。')).toBe(false);
    expect(isTypesettingCueText('{\\b1\\c&HFFFFFF&}強調されたセリフ')).toBe(false);
    // `\pos` starts with `p` but is not the `\p1` drawing tag, and must not be read as one
    // in reverse either: a bare `\p0` turns drawing OFF and is not by itself typesetting.
    expect(isTypesettingCueText('{\\p0}ふつうの行')).toBe(false);
  });

  it('does not treat alignment alone as typesetting — `\\an8` is top-placed SPEECH', () => {
    // Measured, not assumed. Ablating each term against the OVA's ground truth: dropping
    // `\an` changes nothing (recall stays 100.0%, rail stays 430 rows) because it flags
    // ZERO lines the positioning group does not already catch, while the positioning group
    // alone is worth 199 signs. So `\an` was pure precision risk. And the risk is real:
    // `\an8` is align-top, which fansubbers use for ordinary dialogue moved above on-screen
    // text — `videoGrammarHighlightRender` has used exactly this line as its example of an
    // override on plain speech since before S6 existed, and an earlier draft of this
    // classifier hid it.
    expect(isTypesettingCueText('{\\an8}こんにちは')).toBe(false);
    expect(isTypesettingCueText('{\\an2}下に寄せたセリフ')).toBe(false);
    // But alignment ALONGSIDE positioning is still a sign, so the removal did not
    // punch a hole in the real cases.
    expect(isTypesettingCueText('{\\an8\\pos(640,50)}看板')).toBe(true);
  });
});

describe('the sign filter in the rail', () => {
  it('hides typesetting by default and keeps exactly the spoken lines', async () => {
    const host = await mountPanel(MIXED, 1);
    const shown = texts(host);
    expect(shown).toHaveLength(10);
    expect(shown).toEqual(Array.from({ length: 10 }, (_, i) => `セリフ${i}です。`));
    // The control-shaped half: none of the ten sign lines survived.
    expect(shown.some((line) => line.includes('看板') || line.includes('m 0 0'))).toBe(false);
  });

  it('states its own number rather than shrinking silently', async () => {
    const host = await mountPanel(MIXED, 1);
    const notice = host.querySelector('[data-study-notice="signs-hidden"]');
    expect(notice).not.toBeNull();
    // Both numbers the user is owed, actually substituted — a key that fell through
    // untranslated, or a slot left unfilled, still renders a plausible-looking line.
    expect(notice?.textContent).toContain('10');
    expect(notice?.textContent).not.toContain('{');
    expect(notice?.textContent).not.toContain('mediaWorkspace.');
    expect(notice?.getAttribute('role')).toBe('status');
  });

  it('brings the signs back when the control is switched on', async () => {
    const host = await mountPanel(MIXED, 1);
    const toggle = signsToggle(host);
    if (!toggle) throw new Error('the sign control is missing on a track that has signs');
    expect(toggle.checked).toBe(false);

    await act(async () => {
      toggle.click();
    });

    expect(texts(host)).toHaveLength(20);
    // And the notice retracts with it — it would be false while nothing is hidden.
    expect(host.querySelector('[data-study-notice="signs-hidden"]')).toBeNull();
  });

  it('leaves an SRT track untouched and offers no control, because nothing is withheld', async () => {
    const host = await mountPanel(SRT, 2);
    expect(texts(host)).toHaveLength(6);
    expect(signsToggle(host)).toBeNull();
    expect(host.querySelector('[data-study-notice="signs-hidden"]')).toBeNull();
  });

  it('keeps the emphasis hierarchy after filtering, which cue-index bands would lose', async () => {
    // Cue 5 is `セリフ2です。`, the third surviving row. Its neighbours in the RAIL are cues
    // 3 and 7 — four and two cue indices away, so `rowDistance` on cue indices would call
    // one of them `past`/`far`. Measured in positions they are `near`, which is the point.
    const host = await mountPanel(MIXED, 5);
    const bands = [...host.querySelectorAll('.study-transcript-row')].map((row) => [
      row.getAttribute('data-cue-index'),
      row.getAttribute('data-distance'),
    ]);
    expect(Object.fromEntries(bands)).toMatchObject({
      5: 'active',
      3: 'near',
      7: 'near',
      1: 'past',
      9: 'mid',
      19: 'far',
    });
    // Sanity: more than one band is in play, or "hierarchy kept" is trivially true.
    expect(new Set(bands.map(([, b]) => b)).size).toBeGreaterThan(3);
  });

  it('anchors on the previous spoken line while a hidden sign is on screen', async () => {
    // Cue 6 is a `\clip` sign, filtered out. The rail must not go anchorless (all-`mid`,
    // the exact S5 defect shape) just because the cue on screen has no row.
    const host = await mountPanel(MIXED, 6);
    const bands = Object.fromEntries(
      [...host.querySelectorAll('.study-transcript-row')].map((row) => [
        row.getAttribute('data-cue-index'),
        row.getAttribute('data-distance'),
      ]),
    );
    expect(bands['5']).toBe('active');
    expect(Object.values(bands).every((b) => b === 'mid')).toBe(false);
    // The highlight itself still tracks the real activeIndex, so nothing claims cue 6 is
    // being spoken by a row that is not it.
    expect(host.querySelectorAll('[data-active="true"]').length).toBe(0);
  });

  it('does not report an all-typesetting track as having no subtitles', async () => {
    const signsOnly = MIXED.filter((_, i) => i % 2 === 0);
    const host = await mountPanel(signsOnly, 0);
    const empty = host.querySelector('.study-transcript-empty');
    expect(empty).not.toBeNull();
    // The cues exist; the panel is hiding them. Saying "no subtitle track is loaded" here
    // would be the dishonest-state failure, so the copy must differ from that string.
    expect(empty?.textContent).not.toContain('No subtitle track is loaded');
    expect(signsToggle(host)).not.toBeNull();
  });
});
