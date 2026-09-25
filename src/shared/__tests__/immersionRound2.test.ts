import { describe, expect, it } from 'vitest';
import {
  addImmersionTab,
  clearImmersionHistory,
  closeImmersionTab,
  cycleImmersionTab,
  detectImmersionTextLang,
  emptySession,
  immersionNavAfter,
  immersionScrollPct,
  IMMERSION_MAX_TABS,
  type ImmersionSite,
} from '../immersion';

describe('r2 #10 — the Back/Forward stack', () => {
  it('pushes a new page, ignores the current one, and truncates forward entries', () => {
    let nav = immersionNavAfter({ entries: [], index: -1 }, 'a');
    nav = immersionNavAfter(nav, 'b');
    expect(immersionNavAfter(nav, 'b')).toBe(nav);
    nav = { ...nav, index: 0 };
    expect(immersionNavAfter(nav, 'c')).toEqual({ entries: ['a', 'c'], index: 1 });
  });

  it('replaces the entry for a redirect of the page the app asked for', () => {
    const nav = immersionNavAfter({ entries: ['a'], index: 0 }, 'a2', { replace: true });
    expect(nav).toEqual({ entries: ['a2'], index: 0 });
  });
});

describe('r2 #11 — tabs', () => {
  it('opens up to the cap, closes to the left neighbour, and cycles', () => {
    let s = emptySession();
    for (let i = 0; i < 10; i += 1) s = addImmersionTab(s);
    expect(s.tabs).toHaveLength(IMMERSION_MAX_TABS);
    const last = s.activeTabId;
    const closed = closeImmersionTab(s, last);
    expect(closed.activeTabId).toBe(s.tabs[s.tabs.length - 2].id);
    expect(cycleImmersionTab(closed, 1)).toBe(closed.tabs[0].id);
    expect(closeImmersionTab(emptySession(), 'tab-1').tabs).toHaveLength(1);
  });
});

describe('r2 #12 — clearing history by range', () => {
  it('keeps only what is older than the range', () => {
    const now = 10 * 24 * 60 * 60 * 1000;
    const rows = [
      { lastVisited: now - 30 * 60 * 1000 },
      { lastVisited: now - 2 * 60 * 60 * 1000 },
      { lastVisited: now - 3 * 24 * 60 * 60 * 1000 },
    ] as ImmersionSite[];
    expect(clearImmersionHistory(rows, 'hour', now)).toHaveLength(2);
    expect(clearImmersionHistory(rows, 'day', now)).toHaveLength(1);
    expect(clearImmersionHistory(rows, 'week', now)).toHaveLength(0);
    expect(clearImmersionHistory(rows, 'all', now)).toHaveLength(0);
  });
});

describe('r2 #13 — language and progress the rail can show', () => {
  it('names the language from the text, and lets the study language break a Han-only tie', () => {
    expect(detectImmersionTextLang('今日は天気がいいですね。散歩に行きましょう。')).toBe('ja');
    expect(detectImmersionTextLang('今天天气很好，我们去公园散步吧。这是一个美丽的城市。')).toBe('zh');
    expect(detectImmersionTextLang('Сегодня хорошая погода, пойдём гулять в парк.')).toBe('ru');
    expect(detectImmersionTextLang('The weather is lovely today, let us walk in the park.')).toBe('auto');
    const mostlyHan = `${'東京都中央区銀座四丁目交差点周辺地域開発計画'.repeat(4)}の`;
    expect(detectImmersionTextLang(mostlyHan, 'ja')).toBe('ja');
    expect(detectImmersionTextLang(mostlyHan, 'zh')).toBe('zh');
  });

  it('turns scroll into a reading percentage', () => {
    expect(immersionScrollPct(0, 1000, 500)).toBe(50);
    expect(immersionScrollPct(500, 1000, 500)).toBe(100);
    expect(immersionScrollPct(0, 400, 500)).toBe(100);
  });
});
