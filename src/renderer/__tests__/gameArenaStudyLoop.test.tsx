// @vitest-environment jsdom
/**
 * The Arena as a study loop, driven through the real component and stores:
 *
 *  - today's warm-up is offered and starts a short session;
 *  - a request parked for a cold Arena (Calendar, Agent) selects and starts its game on mount;
 *  - a missed word reaches the post-game review, whose "Review now" brings its card into
 *    today's reviews;
 *  - a game answer on a DUE card is practice and leaves its schedule alone (grading is opt-in);
 *  - an arcade run is gated by three study answers when the setting is on.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}|${Object.entries(vars).map(([k, v]) => `${k}=${String(v)}`).join(',')}` : key,
    lang: 'en',
  }),
  t: (key: string) => key,
  getUiLang: () => 'en',
}));
vi.mock('../components/Icons', () => ({ default: () => null }));
vi.mock('../motion/hooks', () => ({ useCountUp: (n: number) => n }));
vi.mock('../motion/rewardBurst', () => ({ fireRewardAt: vi.fn() }));
vi.mock('../storage/db', () => ({
  kvGet: async () => undefined,
  kvSet: async () => undefined,
  kvUpdate: async () => undefined,
  kvDelete: async () => undefined,
  kvBatch: async () => undefined,
  kvScanPrefix: async () => [],
}));

import { GameArena } from '../components/games/GameArenaContent';
import { requestArenaGame } from '../games/arenaIntent';
import { addDeckCardsTracked, loadDeck, resetDeckMemoryForTests, reviewDeckCard } from '../flashcardDeck';
import { resetReviewLogForTests } from '../reviewLog';

let host: HTMLDivElement;
let root: Root;

const render = async (): Promise<void> => {
  await act(async () => {
    root.render(<GameArena />);
  });
};
const byText = (needle: string): HTMLButtonElement | undefined =>
  [...host.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(needle));
const answer = async (text: string): Promise<void> => {
  const box = host.querySelector<HTMLTextAreaElement>('.game-answer-box')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(box, text);
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
};
const advance = async (ms: number): Promise<void> => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  sessionStorage.clear();
  resetDeckMemoryForTests();
  resetReviewLogForTests();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  localStorage.clear();
});

describe('the study loop', () => {
  it("offers today's warm-up and starts a short session on it", async () => {
    await render();
    const warmUp = host.querySelector('.game-warmup');
    expect(warmUp?.textContent).toContain('games2.warmup.reason.starter');
    await act(async () => byText('games2.warmup.start')!.click());
    expect(host.querySelector('.game-stage-head h3')?.textContent).toBe('games.def.kana-sprint.title');
    expect(host.querySelector('.game-round-hud')?.textContent).toContain('total=5');
  });

  it('starts a parked request on mount, and the post-game review brings a missed card forward', async () => {
    const card = addDeckCardsTracked([{ word: '猫', reading: 'ねこ', meaning: 'cat', source: 'import' }])[0];
    reviewDeckCard(card.id, 'good'); // learning: scheduled, not due
    const dueBefore = loadDeck().find((c) => c.id === card.id)!.srs!.dueAt;
    expect(dueBefore).toBeGreaterThan(Date.now());
    requestArenaGame({ gameId: 'reverse-recall', autostart: true, material: 'due', rounds: 3 });
    await render();
    expect(host.querySelector('.game-stage-head h3')?.textContent).toBe('games.def.reverse-recall.title');
    expect(host.querySelector('.game-prompt-main')?.textContent).toBe('猫');

    await answer('not the meaning');
    // Run the clock out: the session ends on time with the miss recorded.
    await advance(60_000);
    const review = host.querySelector('.game-review');
    expect(review, 'no post-game review after a miss').not.toBeNull();
    expect(review!.textContent).toContain('猫');
    expect(host.querySelector('.game-result-srs')?.textContent).toContain('practiced=1');

    await act(async () => byText('games2.review.reviewNow')!.click());
    expect(loadDeck().find((c) => c.id === card.id)!.srs!.dueAt).toBeLessThanOrEqual(Date.now());
    expect(review!.textContent).toContain('games2.review.queued');
  });

  it('a DUE card answered in a game is practice: its schedule is not graded', async () => {
    const card = addDeckCardsTracked([{ word: '猫', reading: 'ねこ', meaning: 'cat', source: 'import' }])[0];
    reviewDeckCard(card.id, 'good', Date.now() - 30 * 86_400_000); // long overdue
    const before = loadDeck().find((c) => c.id === card.id)!.srs;
    expect(before!.dueAt).toBeLessThanOrEqual(Date.now());
    requestArenaGame({ gameId: 'reverse-recall', autostart: true, material: 'due', rounds: 3 });
    await render();
    expect(host.querySelector('.game-prompt-main')?.textContent).toBe('猫');
    await answer('not the meaning');
    await advance(60_000);
    expect(loadDeck().find((c) => c.id === card.id)!.srs).toEqual(before);
    const banked = host.querySelector('.game-result-srs')?.textContent ?? '';
    expect(banked).toContain('graded=0');
    expect(banked).toContain('practiced=1');
  });

  it('gates an arcade run behind three study answers', async () => {
    localStorage.setItem('jp-wired-discovered-v1', '1');
    requestArenaGame({ gameId: 'signal-simon' });
    await render();
    expect(host.querySelector('.arcade-gate')).not.toBeNull();
    expect(host.querySelector('.arcade-mines')).toBeNull();
    for (let i = 0; i < 3; i += 1) {
      await answer('x');
      await advance(2_000);
    }
    expect(host.querySelector('.arcade-gate')).toBeNull();
    expect(host.querySelector('.arcade-mines')).not.toBeNull();
  });
});
