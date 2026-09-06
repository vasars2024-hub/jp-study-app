// @vitest-environment jsdom
/**
 * A capture row has to be named by what was captured, not by where it came from.
 *
 * MEASURED LIVE 2026-09-06 on the user's own history through the debug bridge.
 * `lensHistoryList()` returned **42 entries**; the Captures tab rendered 20 rows
 * and **19 of them were titled `clipboard` (x4) or `screen` (x15)**. Exactly one
 * row — a web capture whose `sourceLabel` really is a page title — was
 * distinguishable. The list could be counted but not read.
 *
 * The cause was `title: entry.sourceLabel || entry.text.slice(0, 40)`. That reads
 * as a sensible fallback and is not one, because `sourceLabel` is never empty for
 * these: the lens stores the SOURCE KIND in it, the literal strings `'clipboard'`
 * and `'screen'`. So the `||` never fired, and the title restated the source that
 * the meta column beside it was already rendering as "Clipboard" / "Screen" —
 * the same word, twice, on every row.
 *
 * Every one of those entries had real text (69, 24, 26, 2000, 453 and 272
 * characters in the first six), so the information to tell them apart was present
 * the whole time and simply never reached the screen.
 *
 * THE FIXTURE USES THE SHAPE THE LIVE STORE ACTUALLY HAS. Note the difference
 * from `readingCapturesFilter.test.tsx`, which passes `'Screen'`/`'Clipboard'` as
 * `sourceLabel` — capitalised, and therefore not what the lens writes. That
 * fixture is fine for what it tests, but a title test built on it would have been
 * green against the defect. This one is deliberately lowercase, and the
 * case-insensitive comparison is asserted directly so the two cannot drift.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ReadingLensHistoryEntry } from '../../shared/readingLensHistory';
import ReadingCapturesView from '../views/ReadingCapturesView';
import {
  createReadingSurfaceHarness,
  installReadingSurfaceApi,
  installResizeObserver,
  type ReadingSurfaceHarness,
} from './helpers/readingCanvasSurface';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const entry = (
  id: string,
  source: string,
  sourceLabel: string,
  text: string,
  capturedAt: number,
): ReadingLensHistoryEntry =>
  ({ captureId: id, text, source, sourceLabel, capturedAt } as ReadingLensHistoryEntry);

/**
 * Four captures as the lens really stores them: three whose `sourceLabel` is the
 * bare source kind, and one web capture with a genuine page title to prove the
 * fix does not throw a real label away.
 */
const ENTRIES: ReadingLensHistoryEntry[] = [
  entry('cap-1', 'clipboard', 'clipboard', '吾輩は猫である。名前はまだ無い。', 1_700_000_004_000),
  entry('cap-2', 'clipboard', 'clipboard', '今日はいい天気です。', 1_700_000_003_000),
  entry('cap-3', 'screen', 'screen', '駅前の書店に寄った。', 1_700_000_002_000),
  entry('cap-4', 'screen', '熊本県 泥棒が家などに入らないように | NHK', '熊本県 泥棒が…', 1_700_000_001_000),
];

const LOADING = 'Loading captures…';
let harness: ReadingSurfaceHarness | null = null;

async function mount(entries: ReadingLensHistoryEntry[]): Promise<ReadingSurfaceHarness> {
  installReadingSurfaceApi({ lensHistoryList: () => Promise.resolve(entries) });
  harness = createReadingSurfaceHarness({
    render: () => <ReadingCapturesView passage={null} />,
    ready: (container) => !(container.textContent ?? '').includes(LOADING),
  });
  await harness.mount(1200);
  return harness;
}

const titles = (h: ReadingSurfaceHarness): string[] =>
  [...h.container.querySelectorAll('.reading-captures-row-title')].map((e) => e.textContent ?? '');

beforeEach(() => {
  installResizeObserver();
});

afterEach(() => {
  harness?.teardown();
  harness = null;
});

describe('Reading captures — rows are named by their content', () => {
  // The regression. Before the fix these read ['clipboard','clipboard','screen',…].
  it('does not title a row with its own source kind', async () => {
    const h = await mount(ENTRIES);
    const rendered = titles(h);

    expect(rendered).toHaveLength(ENTRIES.length);
    for (const title of rendered) {
      expect(title.toLowerCase(), 'a row titled by its source names nothing').not.toBe('clipboard');
      expect(title.toLowerCase()).not.toBe('screen');
    }
  });

  /**
   * The property that actually matters to the user, stated as itself: rows that
   * hold different captures must READ differently. Asserted over the set rather
   * than per row, because "not equal to the source kind" could still be satisfied
   * by some other single repeated string.
   */
  it('gives captures from the same source distinct titles', async () => {
    const h = await mount(ENTRIES);
    const rendered = titles(h);

    expect(new Set(rendered).size, 'four different captures must not share a title').toBe(4);
    expect(rendered[0]).toContain('吾輩は猫である');
    expect(rendered[1]).toContain('今日はいい天気です');
  });

  // The control: a real label is still a better title than a text preview, so the
  // fix must not flatten every row to its content.
  it('keeps a genuine label when the capture has one', async () => {
    const h = await mount(ENTRIES);

    expect(titles(h)[3]).toBe('熊本県 泥棒が家などに入らないように | NHK');
  });

  // A capture with no text at all must still be named something rather than
  // rendering an empty row, which is the failure the naive `text` swap would add.
  it('falls back to the label rather than leaving a row nameless', async () => {
    const h = await mount([entry('cap-empty', 'clipboard', 'clipboard', '   ', 1_700_000_000_000)]);

    expect(titles(h)).toEqual(['clipboard']);
  });
});
