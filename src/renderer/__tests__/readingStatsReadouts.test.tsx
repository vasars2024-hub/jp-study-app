// @vitest-environment jsdom
/**
 * The reading-speed and reading-stats sentences, through the real English
 * catalog: the novel reader's footer readout, the visual-novel panel's line and
 * the Continue reading shelf's "last read" phrase.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../i18n';
import ReaderSpeedReadout, { bookSpeedSentence } from '../components/reading/ReaderSpeedReadout';
import { lastReadLabel } from '../components/reading/ContinueReadingShelf';
import { visualNovelStatsLine } from '../components/immersion/visualNovelStatsLine';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('ReaderSpeedReadout', () => {
  it('shows this session\'s speed, with the session and the book in its accessible name', async () => {
    await act(async () => {
      root.render(<ReaderSpeedReadout session={{ seconds: 120, chars: 800 }} book={{ seconds: 3600, chars: 24000 }} t={t} lang="en" />);
    });
    const el = host.querySelector<HTMLElement>('[data-reader-speed]')!;
    expect(el.textContent).toBe('400 chars/min');
    expect(el.getAttribute('aria-label')).toContain('This session');
    expect(el.getAttribute('aria-label')).toContain('This book');
    expect(el.getAttribute('aria-label')).toContain('400 chars/min');
  });

  it('falls back to the book speed before a minute of this session, and renders nothing with no data', async () => {
    await act(async () => {
      root.render(<ReaderSpeedReadout session={{ seconds: 20, chars: 100 }} book={{ seconds: 600, chars: 3000 }} t={t} lang="en" />);
    });
    expect(host.textContent).toBe('300 chars/min in this book');
    await act(async () => {
      root.render(<ReaderSpeedReadout session={{ seconds: 0, chars: 0 }} book={null} t={t} lang="en" />);
    });
    expect(host.querySelector('[data-reader-speed]')).toBeNull();
  });

  it('bookSpeedSentence waits for a minute of the book', () => {
    expect(bookSpeedSentence({ seconds: 30, chars: 100 }, t, new Intl.NumberFormat('en'))).toBeNull();
  });
});

describe('visualNovelStatsLine', () => {
  it('joins what there is, with plurals', () => {
    expect(visualNovelStatsLine({ lines: 1204, chars: 38912, speakers: 1, playtimeSec: 600, charsPerMinute: 212, mined: 0 }, t, 'en'))
      .toBe('1,204 lines · 38,912 chars · 1 speaker · 212 chars/min');
  });
});

describe('lastReadLabel', () => {
  it('says today, yesterday or N days ago by calendar day', () => {
    const now = new Date(2026, 9, 8, 15, 0).getTime();
    expect(lastReadLabel(new Date(2026, 9, 8, 0, 5).getTime(), now, t)).toBe('today');
    expect(lastReadLabel(new Date(2026, 9, 7, 23, 50).getTime(), now, t)).toBe('yesterday');
    expect(lastReadLabel(new Date(2026, 9, 3, 12, 0).getTime(), now, t)).toBe('5 days ago');
  });
});
