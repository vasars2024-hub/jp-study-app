// @vitest-environment jsdom
/**
 * The scheduling panel, driven the way a user drives it, over the real store.
 *
 * Deliberately NOT mocking `flashcardDeck`: the whole claim of this panel is
 * that pressing its buttons changes what is persisted, and a mocked store
 * cannot show that. The sweeps themselves are pinned in `deckScheduleSweeps`.
 *
 * What only a rendered pass shows:
 *
 * - the algorithm choice reaches the setting AND the next review written to the
 *   deck, rather than being a radio that paints itself;
 * - switching does not rewrite the deck — the promise the panel makes in words
 *   is checked against the store;
 * - reset takes two presses and says what it destroys before the first one;
 * - the forecast counts an unscheduled card as due, agreeing with the review
 *   button instead of quietly excluding it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) => (
      vars ? `${key}(${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')})` : key
    ),
    lang: 'en',
  }),
}));

import SchedulingPreferencesPanel from '../components/flashcards/SchedulingPreferences';
import { loadDeck, replaceImportedDeck, reviewDeckCard } from '../flashcardDeck';
import { loadSchedulingConfig } from '../flashcardScheduling';

const NOW = Date.UTC(2026, 7, 29, 9);

let host: HTMLDivElement;
let root: Root;

function mount(): void {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root.render(createElement(SchedulingPreferencesPanel)); });
}

function buttons(): HTMLButtonElement[] {
  return Array.from(host.querySelectorAll('button'));
}

function click(label: string): void {
  const button = buttons().find((b) => b.textContent === label);
  if (!button) {
    throw new Error(`no button ${label} in [${buttons().map((b) => b.textContent).join(' | ')}]`);
  }
  act(() => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

function radios(): HTMLInputElement[] {
  return Array.from(host.querySelectorAll('input[type="radio"]'));
}

function seed(): void {
  replaceImportedDeck('seed-book', 'Seed', [
    { word: '食べる', reading: 'たべる', meaning: 'to eat', folder: 'verbs' },
    { word: '飲む', reading: 'のむ', meaning: 'to drink', folder: 'verbs' },
    { word: '猫', reading: 'ねこ', meaning: 'cat', folder: 'nouns' },
  ]);
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  seed();
});

afterEach(() => {
  act(() => { root.unmount(); });
  host.remove();
});

describe('SchedulingPreferencesPanel', () => {
  it('opens on the default scheduler with both choices offered', () => {
    mount();
    expect(host.textContent).toContain('flash.schedule.sm2');
    expect(host.textContent).toContain('flash.schedule.fsrs');
    expect(radios()).toHaveLength(2);
    expect(radios()[0].checked).toBe(true);
    expect(radios()[1].checked).toBe(false);
  });

  it('hides the retention control until FSRS is chosen — it means nothing under SM-2', () => {
    mount();
    expect(host.querySelector('input[type="range"]')).toBeNull();
    act(() => { radios()[1].click(); });
    expect(host.querySelector('input[type="range"]')).not.toBeNull();
    expect(host.textContent).toContain('flash.schedule.retention(percent=90)');
  });

  it('the choice reaches the setting and the next review written to the deck', () => {
    mount();
    act(() => { radios()[1].click(); });
    expect(loadSchedulingConfig().algorithm).toBe('fsrs');
    reviewDeckCard(loadDeck()[0].id, 'good', NOW);
    expect(loadDeck()[0].srs?.algorithm).toBe('fsrs');
    expect(loadDeck()[0].srs?.stability).toBeGreaterThan(0);
  });

  it('KEEPS ITS PROMISE: switching alone does not rewrite a single card', () => {
    reviewDeckCard(loadDeck()[0].id, 'good', NOW);
    const before = loadDeck()[0].srs;
    mount();
    act(() => { radios()[1].click(); });
    act(() => { radios()[0].click(); });
    expect(loadDeck()[0].srs).toEqual(before);
    expect(host.textContent).toContain('flash.schedule.switchNote');
  });

  it('converts on request and reports the count, leaving unstudied cards alone', () => {
    reviewDeckCard(loadDeck()[0].id, 'good', NOW);
    mount();
    act(() => { radios()[1].click(); });
    click('flash.schedule.convert(count=1)');
    expect(host.textContent).toContain('flash.schedule.convertReport(changed=1,unscheduled=2)');
    expect(loadDeck()[0].srs?.algorithm).toBe('fsrs');
    expect(loadDeck()[2].srs).toBeUndefined();
  });

  it('CONFIRMATION: reset says what it destroys and takes a second press', () => {
    reviewDeckCard(loadDeck()[0].id, 'good', NOW);
    mount();
    click('flash.schedule.reset');
    // Nothing gone yet, and the count of what would go is on screen.
    expect(host.textContent).toContain('flash.schedule.resetWarning(count=1)');
    expect(loadDeck()[0].srs).toBeDefined();
    click('flash.schedule.resetConfirm');
    expect(host.textContent).toContain('flash.schedule.resetReport(changed=1)');
    expect(loadDeck()[0].srs).toBeUndefined();
  });

  it('withdraws the reset confirmation when a setting changes under it', () => {
    reviewDeckCard(loadDeck()[0].id, 'good', NOW);
    mount();
    click('flash.schedule.reset');
    expect(host.textContent).toContain('flash.schedule.resetWarning');
    act(() => { radios()[1].click(); });
    expect(host.textContent).not.toContain('flash.schedule.resetWarning');
    expect(loadDeck()[0].srs).toBeDefined();
  });

  it('offers neither sweep on a deck with nothing scheduled', () => {
    mount();
    const disabled = buttons().filter((b) => b.disabled).map((b) => b.textContent);
    expect(disabled).toContain('flash.schedule.convert(count=0)');
    expect(disabled).toContain('flash.schedule.reset');
  });

  it('forecasts from stored due dates and counts unscheduled cards as due now', () => {
    reviewDeckCard(loadDeck()[0].id, 'good', Date.now());
    mount();
    // Two never-studied cards are due; the reviewed one is a day out.
    expect(host.textContent).toContain('flash.schedule.forecastDue(count=2)');
    const rows = Array.from(host.querySelectorAll('.flash-test-line'));
    expect(rows).toHaveLength(7);
    expect(rows[0].textContent).toContain('flash.schedule.today');
    const scheduled = rows.filter((row) => !row.textContent?.includes('dayDue(count=0)'));
    expect(scheduled).toHaveLength(1);
  });
});
