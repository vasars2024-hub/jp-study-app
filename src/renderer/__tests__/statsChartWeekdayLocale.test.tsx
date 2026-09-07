// @vitest-environment jsdom
/**
 * D210 — the 14-day chart's axis kept English weekday initials in every language.
 *
 * Live at pid 14128 window 12: the Statistics headings translated into Japanese
 * while all fourteen `.stats-bar-lbl` still read T W T F S S M …, because
 * `weekdayInitial` indexed a hardcoded `['S','M','T','W','T','F','S']`.
 *
 * The two guards that matter here are the ones a hardcoded array passes by
 * accident: English must be UNCHANGED (S M T W T F S is also what CLDR narrow
 * gives, so a regression here is invisible in the language most turns run in),
 * and ja/zh/ru must each be a DIFFERENT set from English — a formatter given
 * the wrong locale tag silently falls back to English and would otherwise read
 * as a pass.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// StatsContent pulls in ankiSync, which subscribes to `window.api` at module
// scope — absent under jsdom. Same stub statisticsModeParity.test.tsx uses.
vi.mock('../ankiSync', () => ({ syncKnowledgeFromAnki: vi.fn() }));

import {
  chartDayLabel,
  StatsChart,
  weekdayInitial,
  type StatsState,
} from '../components/stats/StatsContent';
import { getUiLang, setUiLang } from '../i18n';
import { ensureCatalog } from '../../shared/i18n/catalogs';
import { formatNumber, type StatsSummary } from '../stats';

/** 2026-09-06 is a Sunday, so this is one whole week starting at index 0. */
const WEEK = [
  '2026-09-06',
  '2026-09-07',
  '2026-09-08',
  '2026-09-09',
  '2026-09-10',
  '2026-09-11',
  '2026-09-12',
];

function week(lang: 'en' | 'ja' | 'zh' | 'ru'): string[] {
  return WEEK.map((iso) => weekdayInitial(iso, lang));
}

describe('weekdayInitial', () => {
  it('is unchanged in English — Sunday through Saturday', () => {
    expect(week('en')).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S']);
  });

  it('speaks Japanese', () => {
    expect(week('ja')).toEqual(['日', '月', '火', '水', '木', '金', '土']);
  });

  it('speaks Chinese', () => {
    expect(week('zh')).toEqual(['日', '一', '二', '三', '四', '五', '六']);
  });

  it('speaks Russian', () => {
    // CLDR narrow: one Cyrillic letter per day, Sunday first.
    expect(week('ru')).toEqual(['В', 'П', 'В', 'С', 'Ч', 'П', 'С']);
  });

  it('gives every non-English language a set of its own', () => {
    const en = week('en').join('');
    for (const lang of ['ja', 'zh', 'ru'] as const) {
      expect(week(lang).join(''), `${lang} fell back to English`).not.toBe(en);
    }
  });

  it('stays one glyph per day in every language, because the axis has one slot', () => {
    for (const lang of ['en', 'ja', 'zh', 'ru'] as const) {
      for (const label of week(lang)) {
        expect([...label], `${lang} label "${label}"`).toHaveLength(1);
      }
    }
  });

  it('defaults to English when no language is passed', () => {
    expect(weekdayInitial('2026-09-07')).toBe('M');
  });
});

/**
 * The one above tests the function; this tests the CALL. Dropping `lang` at the
 * call site leaves every unit test above green and puts the English axis
 * straight back on screen — which is exactly the shape D210 shipped in.
 */
describe('StatsChart renders its axis in the interface language', () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    setUiLang('en');
    await act(async () => {
      await Promise.resolve();
    });
  });

  /** `StatsChart` never calls either — the chart is read-only. */
  const noop = vi.fn();

  function state(): StatsState {
    const summary = {
      totalSeconds: 0,
      totalChars: 0,
      totalWatchSeconds: 0,
      daysActive: 1,
      streak: 1,
      todaySeconds: 60,
      todayChars: 10,
      todayWatchSeconds: 0,
      recent: WEEK.map((date) => ({ date, seconds: 60, chars: 10, watchSeconds: 0 })),
      books: [],
      shows: [],
    } satisfies StatsSummary;
    return { summary, peak: 60, hasData: true, refresh: noop, resetAllStats: noop };
  }

  async function labels(): Promise<string[]> {
    await act(async () => {
      root.render(<StatsChart state={state()} />);
    });
    return [...host.querySelectorAll('.stats-bar-lbl')].map((n) => n.textContent ?? '');
  }

  it('is English by default', async () => {
    expect(await labels()).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S']);
  });

  it('follows a switch to Japanese', async () => {
    // `setUiLang` only lands once the language's catalog chunk resolves, so
    // resolve it first and then give the promise chain a tick.
    await ensureCatalog('ja');
    setUiLang('ja');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(getUiLang(), 'the language switch never landed').toBe('ja');
    expect(await labels()).toEqual(['日', '月', '火', '水', '木', '金', '土']);
  });
});

/**
 * D211 — `formatNumber` pinned `'en-US'`, so `13,200 симв.` shipped in the
 * Russian tooltip where Russian groups with a space. Same surface, same class.
 */
describe('formatNumber follows the interface language', () => {
  afterEach(async () => {
    setUiLang('en');
    await new Promise((r) => setTimeout(r, 0));
  });

  it('groups Russian with a space and English with a comma', async () => {
    expect(formatNumber(13200)).toBe('13,200');

    await ensureCatalog('ru');
    setUiLang('ru');
    await new Promise((r) => setTimeout(r, 0));
    expect(getUiLang(), 'the language switch never landed').toBe('ru');

    const ru = formatNumber(13200);
    expect(ru, 'still grouped the English way').not.toBe('13,200');
    // CLDR uses a non-breaking space here; assert the digits and that whatever
    // separates them is whitespace, not the ICU version's exact codepoint.
    expect(ru.replace(/\s/gu, ' ')).toBe('13 200');
  });
});

describe('chartDayLabel', () => {
  it('writes the tooltip date the way each language writes dates', () => {
    const en = chartDayLabel('2026-09-07', 'en');
    const ja = chartDayLabel('2026-09-07', 'ja');
    const ru = chartDayLabel('2026-09-07', 'ru');

    // Not asserting exact CLDR strings — those move between ICU versions.
    // What must hold is that each is native and none is the raw ISO input.
    expect(en).not.toBe('2026-09-07');
    expect(en).toMatch(/Sep/);
    expect(ja).toMatch(/月/);
    expect(ru).toMatch(/[а-яА-Я]/);
    expect(new Set([en, ja, ru]).size).toBe(3);
  });
});

/**
 * D168 — every per-day figure in the 14-day chart was behind a mouse hover.
 *
 * Each column was a plain `<div>` carrying only `title`: no role, no
 * `aria-label`, no `tabindex`. A bare div takes no accessible name from
 * `title`, and with no focus stop there was no keyboard route to it either, so
 * the bar heights were the entire non-mouse representation of the series.
 * Measured live at pid 14128 window 12: 14 columns, `role` null, `aria-label`
 * null, `tabindex` null.
 *
 * The label is asserted to EQUAL the title rather than merely to exist, because
 * a second hand-built string is exactly how the two would drift apart.
 */
describe('StatsChart names each day for a reader who is not using a mouse', () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  const noop = vi.fn();

  function chartState(watch: boolean): StatsState {
    const summary = {
      totalSeconds: 600,
      totalChars: 4200,
      totalWatchSeconds: watch ? 900 : 0,
      daysActive: 2,
      streak: 1,
      todaySeconds: 60,
      todayChars: 10,
      todayWatchSeconds: 0,
      recent: [
        { date: '2026-09-06', seconds: 600, chars: 4200, watchSeconds: watch ? 900 : 0 },
        { date: '2026-09-07', seconds: 120, chars: 55, watchSeconds: 0 },
      ],
      books: [],
      shows: [],
    } satisfies StatsSummary;
    return { summary, peak: 600, hasData: true, refresh: noop, resetAllStats: noop };
  }

  async function columns(watch = false): Promise<HTMLElement[]> {
    await act(async () => {
      root.render(<StatsChart state={chartState(watch)} />);
    });
    return [...host.querySelectorAll<HTMLElement>('.stats-bar-col')];
  }

  it('gives every column a role and a name, and the name is the tooltip', async () => {
    const cols = await columns();
    expect(cols).toHaveLength(2);
    for (const col of cols) {
      expect(col.getAttribute('role')).toBe('img');
      const label = col.getAttribute('aria-label') ?? '';
      expect(label.length, 'an empty name is the same as no name').toBeGreaterThan(0);
      expect(label, 'the name and the tooltip drifted apart').toBe(col.getAttribute('title'));
    }
  });

  it('names the day its own figures, not a constant', async () => {
    const [first, second] = await columns();
    expect(first.getAttribute('aria-label')).not.toBe(second.getAttribute('aria-label'));
    expect(first.getAttribute('aria-label')).toContain(formatNumber(4200));
    expect(second.getAttribute('aria-label')).toContain('55');
  });

  it('includes watched time once anything has been watched', async () => {
    const [first] = await columns(true);
    const withWatch = first.getAttribute('aria-label') ?? '';
    const [plain] = await columns(false);
    expect(withWatch).not.toBe(plain.getAttribute('aria-label'));
    expect(withWatch).toContain('15m');
  });
});
