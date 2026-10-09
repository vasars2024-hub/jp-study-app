// @vitest-environment jsdom
/** gram2 — the Review tab asks a cloze for a learned point, checks a typed answer, and grades into the schedule. */
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
import { grammarReviewPrompt } from '../grammarReviewPrompt';
import { loadGrammarSrs, saveGrammarSrs } from '../grammarSrs';
import type { LocalSrsState } from '../../shared/localSrs';

const learned: LocalSrsState = {
  version: 2,
  dueAt: Date.now() - 60_000,
  intervalDays: 1,
  ease: 2.5,
  repetitions: 1,
  lapses: 0,
  lastReviewedAt: Date.now() - 86_400_000,
  lastRating: 'good',
};

const point = GRAMMAR.find((p) => p.lang === 'ja' && grammarReviewPrompt(p, learned).kind === 'cloze')!;
const cloze = grammarReviewPrompt(point, learned).cloze!;

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
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

describe('gram2 review prompts', () => {
  it('blanks the pattern, checks the typed answer, and grades into the schedule', async () => {
    saveGrammarSrs({ [point.id]: learned });
    await mount();
    const card = host.querySelector('.gx-review-card');
    expect(card?.getAttribute('data-prompt')).toBe('cloze');
    // The prompt must not print the pattern it asks for.
    expect(card?.querySelector('h2')?.textContent).toBe('gram2.prompt.clozeTitle');
    expect(card?.querySelectorAll('.gx-review-blank').length).toBe(cloze.answers.length);

    const input = card!.querySelector<HTMLInputElement>('.gx-review-answer input')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(input, cloze.answers.join(''));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      card!.querySelector('form.gx-review-answer')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(host.querySelector('.gx-review-verdict')?.className).toContain('is-right');
    expect(host.querySelector('.gx-review-card h2')?.textContent).toBe(point.title);

    const good = [...host.querySelectorAll<HTMLButtonElement>('.gx-review-rate button')].find((b) =>
      b.textContent?.startsWith('grammar.review.good'),
    )!;
    await act(async () => good.click());
    const after = loadGrammarSrs()[point.id];
    expect(after.repetitions).toBe(2);
    expect(after.dueAt).toBeGreaterThan(Date.now());
  });

  it('points at Again after a wrong typed answer', async () => {
    saveGrammarSrs({ [point.id]: learned });
    await mount();
    const input = host.querySelector<HTMLInputElement>('.gx-review-answer input')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(input, 'ぜんぜんちがう');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      host.querySelector('form.gx-review-answer')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(host.querySelector('.gx-review-verdict')?.className).toContain('is-wrong');
    const again = [...host.querySelectorAll<HTMLButtonElement>('.gx-review-rate button')].find((b) =>
      b.textContent?.startsWith('grammar.review.again'),
    )!;
    expect(again.className).toContain('ui-btn--primary');
  });

  it('shows progress per JLPT level and starts the next new points of a level', async () => {
    await mount();
    const rows = [...host.querySelectorAll('.gx-review-level')];
    expect(rows.map((r) => r.querySelector('.gram-badge')?.textContent)).toEqual(['N5', 'N4', 'N3', 'N2', 'N1']);
    const learn = rows[0].querySelector<HTMLButtonElement>('button')!;
    expect(learn.textContent).toBe('gram2.levels.learnNext:5');
    await act(async () => learn.click());
    const scheduled = Object.keys(loadGrammarSrs());
    expect(scheduled).toHaveLength(5);
    expect(scheduled.every((id) => GRAMMAR.find((p) => p.id === id)?.level === 'N5')).toBe(true);
    // The first enrolled point is now due, as a new point: a recognition prompt.
    expect(host.querySelector('.gx-review-card')?.getAttribute('data-prompt')).toBe('recognition');
  });
});
