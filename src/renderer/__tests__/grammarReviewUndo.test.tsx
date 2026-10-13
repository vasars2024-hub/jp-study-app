// @vitest-environment jsdom
/**
 * One-step Undo on the grammar Review tab, as Flashcards has: the last rating's
 * schedule, familiarity and review-log row are put back, the point is asked again
 * first, and it works from the keyboard (Ctrl+Z) as well as the button.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${Object.values(vars).join(',')}` : key),
    lang: 'en',
  }),
}));

import GrammarReviewPanel from '../components/grammar/GrammarReviewPanel';
import { GRAMMAR } from '../data/grammar';
import { enrolGrammarPoints, loadGrammarSrs, saveGrammarSrs } from '../grammarSrs';
import { loadFamiliarity } from '../grammarFamiliarity';
import { onReviewLogEntry } from '../reviewLog';

const [first, second] = GRAMMAR.filter((p) => p.lang === 'ja' && p.examples.length > 0);

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  // `first` is the more overdue, so it is asked first.
  saveGrammarSrs({
    ...enrolGrammarPoints({}, [first.id], Date.now() - 120_000),
    ...enrolGrammarPoints({}, [second.id], Date.now() - 60_000),
  });
});
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  localStorage.clear();
});

async function mount(): Promise<void> {
  root = createRoot(host);
  await act(async () => root?.render(<GrammarReviewPanel />));
}

const title = () => host.querySelector('.gx-review-card h2')?.textContent;
const panel = () => host.querySelector<HTMLDivElement>('.gx-review')!;

async function key(target: Element, init: KeyboardEventInit): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
  });
}

async function revealAndRateGood(): Promise<void> {
  await act(async () => host.querySelector<HTMLButtonElement>('.gx-review-actions button')!.click());
  const good = [...host.querySelectorAll<HTMLButtonElement>('.gx-review-rate button')].find((b) =>
    b.textContent?.startsWith('grammar.review.good'),
  )!;
  await act(async () => good.click());
}

describe('grammar review undo', () => {
  it('has no Undo before a rating', async () => {
    await mount();
    expect(host.querySelector('.gx-review-undo')).toBeNull();
  });

  it('the button restores the schedule, familiarity, log row and queue position', async () => {
    const before = loadGrammarSrs()[first.id];
    const removed: string[] = [];
    const off = onReviewLogEntry({ removed: (entry) => removed.push(entry.grammarId ?? '') });
    await mount();
    expect(title()).toBe(first.title);
    await revealAndRateGood();
    expect(loadGrammarSrs()[first.id].repetitions).toBe(1);
    expect(loadFamiliarity()[first.id]).toBeDefined();
    expect(title()).toBe(second.title);
    expect(host.querySelector('.gx-review-summary')?.textContent).toContain('grammar.review.done:1');

    const undo = host.querySelector<HTMLButtonElement>('.gx-review-undo')!;
    expect(undo.getAttribute('aria-keyshortcuts')).toBe('Control+Z');
    await act(async () => undo.click());
    off();

    expect(loadGrammarSrs()[first.id]).toEqual(before);
    expect(loadFamiliarity()[first.id]).toBeUndefined();
    expect(removed).toEqual([first.id]);
    expect(title()).toBe(first.title);
    expect(host.querySelector('.gx-review-summary')?.textContent).not.toContain('grammar.review.done');
    // One step only.
    expect(host.querySelector('.gx-review-undo')).toBeNull();
  });

  it('works from the keyboard: Space, 3, then Ctrl+Z, with focus kept in the panel', async () => {
    const before = loadGrammarSrs()[first.id];
    await mount();
    panel().focus();
    await key(panel(), { key: ' ' });
    expect(host.querySelector('.gx-review-rate')).not.toBeNull();
    await key(panel(), { key: '3' });
    expect(loadGrammarSrs()[first.id].repetitions).toBe(1);
    // The rating buttons are gone; focus must not have fallen out of the panel.
    expect(panel().contains(document.activeElement)).toBe(true);

    const bubbled = vi.fn();
    window.addEventListener('keydown', bubbled);
    await key(document.activeElement ?? panel(), { key: 'z', ctrlKey: true });
    window.removeEventListener('keydown', bubbled);
    expect(loadGrammarSrs()[first.id]).toEqual(before);
    expect(title()).toBe(first.title);
    // Consumed here, so the window-level Ctrl+Z (Flashcards' undo) does not also fire.
    expect(bubbled).not.toHaveBeenCalled();
    expect(panel().contains(document.activeElement)).toBe(true);
  });

  it('restores a relearning point exactly, after a rating that kept its lapse', async () => {
    localStorage.clear();
    // A relearning point, so the rating has a real prior state to restore.
    const prior = {
      version: 2 as const,
      algorithm: 'sm2' as const,
      dueAt: Date.now() - 1000,
      intervalDays: 0,
      ease: 2.3,
      repetitions: 0,
      lapses: 1,
      lastReviewedAt: Date.now() - 11 * 60_000,
      lastRating: 'again' as const,
      phase: 'relearning' as const,
      step: 0,
    };
    saveGrammarSrs({ [first.id]: prior });
    await mount();
    await revealAndRateGood();
    // Graduated from relearning with the lapse kept (not reset as a new card).
    const rated = loadGrammarSrs()[first.id];
    expect(rated.lapses).toBe(1);
    expect(rated.ease).toBeCloseTo(2.3, 5);
    expect(rated.phase).toBeUndefined();
    await act(async () => host.querySelector<HTMLButtonElement>('.gx-review-undo')!.click());
    expect(loadGrammarSrs()[first.id]).toEqual(prior);
  });
});
