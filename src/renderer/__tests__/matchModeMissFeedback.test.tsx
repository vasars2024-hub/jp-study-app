// @vitest-environment jsdom
/**
 * Match told you nothing when you got a pair wrong.
 *
 * Measured live 2026-09-08, Flashcards ▸ Start a match round, window 2, pid
 * 4652 (register row D347). Picking 魚 then dog put `is-wrong` on one tile —
 * a dashed border and a colour — and that was the whole signal. The one
 * `aria-live="polite"` region on the surface still read `Matched 1 of 4.`,
 * unchanged, so it announced nothing; `misses` was counted and then held back
 * until the round ended. Learn, one file over, already announces its misses
 * ("Not this one. The meaning is cat."), which is what makes Match the
 * outlier rather than this being the house style.
 *
 * Two properties are pinned here, and the second is the one that is easy to
 * lose in a later refactor: the running count must be IN the sentence, because
 * a polite live region whose text has not changed is silent however wrong the
 * answer was. A "Not a pair." with no count re-announces nothing on the second
 * miss.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CATALOGS, en } from '../../shared/i18n/catalogs/all';
import { translate, type UiLang } from '../../shared/i18n/core';

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) => (
      vars ? `${key}(${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')})` : key
    ),
    lang: 'en',
  }),
}));

let deck: Array<Record<string, unknown>> = [];
vi.mock('../flashcardDeck', () => ({
  loadDeck: () => deck,
  loadPracticeDeck: () => deck,
}));

import MatchMode from '../components/flashcards/MatchMode';

const t = (key: string, lang: UiLang, vars?: Record<string, string | number>) =>
  translate(key, vars, { lang, catalog: CATALOGS[lang], fallback: en });

let host: HTMLDivElement;
let root: Root;

function mount(): void {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root.render(createElement(MatchMode, {})); });
}

function tiles(): HTMLButtonElement[] {
  return Array.from(host.querySelectorAll<HTMLButtonElement>('.flash-match-tile'));
}

/** Every live region's text, joined — the fix must not depend on which one. */
function announced(): string {
  return Array.from(host.querySelectorAll('[aria-live]'))
    .map((e) => e.textContent ?? '')
    .join(' | ');
}

function click(el: HTMLElement): void {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

/** Pick the two tiles that do NOT pair, whatever order the round dealt them. */
function missOnce(): void {
  const all = tiles();
  const jp = all.filter((b) => /[぀-ヿ一-龯]/.test(b.textContent ?? ''));
  const en_ = all.filter((b) => !jp.includes(b));
  // The fixture pairs 猫/cat and 犬/dog, so 猫 + dog is always a miss.
  const wrongJp = jp.find((b) => b.textContent === '猫');
  const wrongEn = en_.find((b) => b.textContent === 'dog');
  expect(wrongJp && wrongEn, 'the round did not deal both fixture cards').toBeTruthy();
  click(wrongJp as HTMLElement);
  click(wrongEn as HTMLElement);
}

beforeEach(() => {
  deck = [
    { id: 'a', word: '猫', reading: 'ねこ', meaning: 'cat' },
    { id: 'b', word: '犬', reading: 'いぬ', meaning: 'dog' },
  ];
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('Match tells you when a pair is wrong', () => {
  it('says nothing about a miss before one happens', () => {
    // Non-vacuity: without this, "the miss line is present" could be true of a
    // line that is always present, and the assertion below would prove nothing.
    mount();
    expect(announced()).not.toContain('flash.match.miss');
  });

  it('announces a wrong pair rather than only colouring the tile', () => {
    mount();
    missOnce();
    expect(host.querySelector('.flash-match-tile.is-wrong'), 'no tile was marked').toBeTruthy();
    expect(announced()).toContain('flash.match.miss(count=1)');
  });

  it('changes the announcement on the second miss, or the live region is silent', () => {
    mount();
    missOnce();
    missOnce();
    expect(announced()).toContain('flash.match.miss(count=2)');
    expect(announced()).not.toContain('flash.match.miss(count=1)');
  });

  it('drops the miss line once the pair is made', () => {
    mount();
    missOnce();
    const all = tiles();
    click(all.find((b) => b.textContent === '猫') as HTMLElement);
    click(all.find((b) => b.textContent === 'cat') as HTMLElement);
    expect(announced()).not.toContain('flash.match.miss');
  });
});

describe('the match strings agree with their own numbers', () => {
  it('uses the singular for one wrong pick, in English', () => {
    // The live reading that opened this row: "with 1 wrong picks."
    expect(t('flash.match.done', 'en', { pairs: 4, count: 1, seconds: 59 }))
      .toBe('All 4 pairs matched in 59s, with 1 wrong pick.');
    expect(t('flash.match.done', 'en', { pairs: 4, count: 2, seconds: 59 }))
      .toBe('All 4 pairs matched in 59s, with 2 wrong picks.');
    expect(t('flash.match.done', 'en', { pairs: 4, count: 0, seconds: 59 }))
      .toBe('All 4 pairs matched in 59s, with 0 wrong picks.');
    expect(t('flash.match.miss', 'en', { count: 1 })).toBe('Not a pair. 1 wrong pick so far.');
    expect(t('flash.match.miss', 'en', { count: 3 })).toBe('Not a pair. 3 wrong picks so far.');
  });

  it('still renders the count in ja, zh and ru after the slot was renamed', () => {
    // Renaming `{misses}` to `{count}` in English alone would have left the
    // other three catalogs interpolating a variable nobody passes, i.e. the
    // literal text `{misses}` on screen in three languages.
    for (const lang of ['ja', 'zh', 'ru'] as UiLang[]) {
      const done = t('flash.match.done', lang, { pairs: 4, count: 2, seconds: 59 });
      expect(done, `${lang} lost the count`).toContain('2');
      expect(done, `${lang} still names the old slot`).not.toContain('{');
      expect(t('flash.match.miss', lang, { count: 2 }), `${lang} miss`).toContain('2');
    }
  });

  it('agrees for the other counted study-mode strings too', () => {
    expect(t('flash.write.length', 'en', { count: 1 })).toBe('1 character.');
    expect(t('flash.write.length', 'en', { count: 4 })).toBe('4 characters.');
    expect(t('flash.test.blanksWarning', 'en', { count: 1 }))
      .toBe('1 question is still blank. Handing in now leaves it unanswered.');
    expect(t('flash.test.closeNote', 'en', { count: 1 }))
      .toBe('1 near miss, counted as neither right nor wrong.');
    expect(t('flash.match.skipped', 'en', { count: 1 })).toContain('1 card was left out');
    expect(t('flash.learn.skipped', 'en', { count: 1 })).toContain('1 card was left out');
    expect(t('flash.test.skipped', 'en', { count: 2 })).toContain('2 cards were left out');
  });
});
