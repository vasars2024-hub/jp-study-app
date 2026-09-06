// @vitest-environment jsdom
/**
 * The round loop, driven for real.
 *
 * Two defects measured live on 2026-09-06 against the running app (D69, D70):
 *
 *  - the typed round's `<textarea>` had no accessible name of any kind — no
 *    label, no placeholder, no `aria-label`, no id to point one at — so it
 *    announced as a bare edit field, and the question it belongs to sat in a
 *    plain `<div class="game-prompt">` with no live region and no association,
 *    so advancing the round swapped the prompt in silence;
 *  - Word Match Rush marked the selected Japanese word with a `class="active"`
 *    and nothing else, so the selection existed in colour only.
 *
 * These are rendering facts, so this suite renders the real component and reads
 * the DOM rather than the source text. Each `it` has a mutation control noted in
 * its comment: reverting the named line must turn exactly that case red.
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
}));

vi.mock('../components/Icons', () => ({ default: () => null }));

// Motion is decorative and reaches for rAF/canvas; the round loop does not need it.
vi.mock('../motion/hooks', () => ({ useCountUp: (n: number) => n }));
vi.mock('../motion/rewardBurst', () => ({ fireRewardAt: vi.fn() }));

import { GameArena } from '../components/games/GameArenaContent';

let host: HTMLDivElement;
let root: Root;

const render = async (): Promise<void> => {
  await act(async () => {
    root.render(<GameArena />);
  });
};

const buttons = (): HTMLButtonElement[] => [...host.querySelectorAll('button')];
const byText = (needle: string): HTMLButtonElement | undefined =>
  buttons().find((b) => (b.textContent ?? '').includes(needle));

/** Pick a game from the left rail, then press Start round. */
const startGame = async (gameLabelKey: string): Promise<void> => {
  const entry = byText(gameLabelKey);
  expect(entry, `no rail entry for ${gameLabelKey}`).toBeDefined();
  await act(async () => {
    entry!.click();
  });
  const start = byText('games.start');
  expect(start, 'no Start round button').toBeDefined();
  await act(async () => {
    start!.click();
  });
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  host.remove();
  localStorage.clear();
});

describe('the typed round names its field and announces its question', () => {
  // Mutation control: delete `aria-label={t('games.a11y.answer')}` from the
  // `.game-answer-box` textarea and this case alone goes red.
  it('gives the answer box an accessible name', async () => {
    await render();
    await startGame('games.def.kana-sprint.title');

    const box = host.querySelector<HTMLTextAreaElement>('.game-answer-box');
    expect(box, 'kana sprint did not reach a typed round').not.toBeNull();
    expect(box!.getAttribute('aria-label')).toBe('games.a11y.answer');
  });

  // Mutation control: delete the `<p className="sr-only" role="status">` block
  // and this case alone goes red. Its sibling above stays green, which is what
  // makes the two independent.
  it('carries a live region that states the current question', async () => {
    await render();
    await startGame('games.def.kana-sprint.title');

    const live = host.querySelector('p.sr-only[role="status"]');
    expect(live, 'no live region beside the round panel').not.toBeNull();
    expect(live!.getAttribute('aria-live')).toBe('polite');
    // It names the round AND repeats the prompt, so the player hears what is
    // being asked and not merely that something changed.
    expect(live!.textContent).toContain('games.a11y.roundPrompt');
    expect(live!.textContent).toContain('current=1');
    expect(live!.textContent).toContain('total=');
  });

  // The control for the whole pair: the live region has to sit OUTSIDE the
  // element React keys on the round id, or it remounts with every question and
  // a screen reader never treats its text as a change. Reading the DOM order
  // is the only way to prove that from a test.
  it('keeps the live region outside the round panel that remounts each question', async () => {
    await render();
    await startGame('games.def.kana-sprint.title');

    const live = host.querySelector('p.sr-only[role="status"]');
    const round = host.querySelector('.game-round-shell');
    expect(live).not.toBeNull();
    expect(round, 'no round shell rendered').not.toBeNull();
    expect(round!.contains(live!)).toBe(false);
  });
});

describe('Word Match Rush reports the pair it is building', () => {
  // Mutation control: delete `aria-pressed={selected === pairItem.jp}` from the
  // left-hand `.game-match-btn` and this case goes red at the second assertion
  // while the first (the un-selected baseline) still passes — so a component
  // that simply never renders the attribute cannot pass it.
  it('marks the selected Japanese word with aria-pressed, not colour alone', async () => {
    await render();
    await startGame('games.def.word-match.title');

    const tiles = () => [...host.querySelectorAll<HTMLButtonElement>('.game-match-btn')];
    expect(tiles().length, 'word match did not reach a match round').toBeGreaterThan(0);

    // Baseline: nothing selected, so nothing claims to be pressed.
    expect(tiles().filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(0);
    expect(tiles().filter((b) => b.className.includes('active'))).toHaveLength(0);

    await act(async () => {
      tiles()[0].click();
    });

    const pressed = tiles().filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    // The ARIA state and the paint must agree — a fix that sets one without the
    // other is the same defect wearing the other face.
    expect(pressed[0].className).toContain('active');
  });

  // Mutation control: delete `aria-pressed={Object.values(matches).includes(meaning)}`
  // from the right-hand `.game-match-btn` and this case alone goes red.
  it('marks a meaning as pressed once it has been paired', async () => {
    await render();
    await startGame('games.def.word-match.title');

    const tiles = () => [...host.querySelectorAll<HTMLButtonElement>('.game-match-btn')];
    const meanings = () => tiles().filter((b) => !b.querySelector('span[lang="ja"]'));

    expect(meanings().length).toBeGreaterThan(0);
    expect(meanings().every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);

    await act(async () => {
      tiles()[0].click();
    });
    await act(async () => {
      meanings()[0].click();
    });

    expect(meanings().filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
  });
});
