// @vitest-environment jsdom
/**
 * a11y3 — axe-core (plus the house ARIA audit) over Grammar: the explorer as
 * it opens, a point opened from it, the guides browser, and the Review tab
 * with a cloze prompt before and after an answer.
 */
import { act, createElement } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { LocalSrsState } from '../../shared/localSrs';
import { a11yViolations } from './helpers/axeAudit';
import { cleanup, installJsdomShims, mount, settle, stubBridge, typeInto } from './helpers/axeHarness';

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

beforeAll(() => {
  installJsdomShims();
  stubBridge({ listLibrary: [], jitenGetStore: { plan: [] } });
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(async () => {
  await cleanup();
});

describe('Grammar — axe-core', () => {
  it('the explorer, and a point opened from it', async () => {
    const { default: GrammarView } = await import('../views/GrammarView');
    const { host } = await mount(createElement(GrammarView), 80);
    expect(host.textContent?.length, 'explorer painted').toBeGreaterThan(40);
    expect(await a11yViolations(host)).toEqual([]);

    // The filter panel, opened from its disclosure.
    const filters = host.querySelector<HTMLElement>('.gram-x-filters-btn');
    expect(filters, 'filters disclosure').not.toBeNull();
    await act(async () => filters?.click());
    await settle(20);
    expect(host.querySelector('#gram-x-filters-panel'), 'filters open').not.toBeNull();
    expect(await a11yViolations(host)).toEqual([]);

    // Open the first point in the list, as a click on it would.
    const item = host.querySelector<HTMLElement>('[role="option"], .gx-point, .gram-point, li button, [data-point-id]');
    if (item) {
      await act(async () => item.click());
      await settle(40);
      expect(await a11yViolations(host)).toEqual([]);
    }
  });

  it('the guides browser', async () => {
    const { GuidesBrowser } = await import('../components/grammar/GrammarContent');
    const { host } = await mount(createElement(GuidesBrowser), 20);
    expect(await a11yViolations(host)).toEqual([]);
  });

  it('review: a cloze prompt, then its verdict and grade buttons', async () => {
    const { GRAMMAR } = await import('../data/grammar');
    const { grammarReviewPrompt } = await import('../grammarReviewPrompt');
    const { saveGrammarSrs } = await import('../grammarSrs');
    const point = GRAMMAR.find((p) => p.lang === 'ja' && grammarReviewPrompt(p, learned).kind === 'cloze');
    if (!point) throw new Error('no cloze-able point');
    saveGrammarSrs({ [point.id]: learned });
    const { default: GrammarReviewPanel } = await import('../components/grammar/GrammarReviewPanel');
    const { host } = await mount(createElement(GrammarReviewPanel), 20);
    expect(host.querySelector('.gx-review-card'), 'review card').not.toBeNull();
    expect(await a11yViolations(host)).toEqual([]);

    const input = host.querySelector<HTMLInputElement>('.gx-review-answer input');
    if (input) {
      await typeInto(input, 'x');
      await act(async () => {
        host.querySelector('form.gx-review-answer')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      await settle(20);
    }
    expect(await a11yViolations(host)).toEqual([]);
  });
});
