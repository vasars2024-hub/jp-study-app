// @vitest-environment jsdom
/**
 * a11y3 — axe-core (plus the house ARIA audit) over the Game Arena: the lobby
 * with its round options open, the first round of every study game, a round
 * after an answer is revealed, Mirror Writing, and the result panel of a
 * finished session.
 */
import { act, createElement } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAME_DEFINITIONS } from '../games/engine';
import { arenaGameTitleKey } from '../games/gameTitles';
import type { GameId } from '../games/types';
import { t } from '../i18n';
import { a11yViolations } from './helpers/axeAudit';
import { cleanup, click, installJsdomShims, mount, settle, stubBridge, typeInto } from './helpers/axeHarness';

// Decorative motion reaches for rAF and canvas; the audit needs only the DOM.
vi.mock('../motion/rewardBurst', () => ({ fireRewardAt: vi.fn() }));

/** The study games that run as rounds (arcade games draw on a canvas jsdom cannot paint). */
const ROUND_GAMES = GAME_DEFINITIONS.filter((g) => g.mode !== 'arcade' && g.id !== 'mirror-writing').map((g) => g.id);
/** Arcade games: listed once Wired (and, for the aero-* four, Aero) has been discovered. */
const ARCADE_GAMES = GAME_DEFINITIONS.filter((g) => g.mode === 'arcade').map((g) => g.id);

beforeAll(() => {
  installJsdomShims();
});

beforeEach(() => {
  localStorage.clear();
  stubBridge();
});

afterEach(async () => {
  await cleanup();
  localStorage.clear();
});

async function arena() {
  const { GameArena } = await import('../components/games/GameArenaContent');
  return mount(createElement(GameArena), 60);
}

function listItem(host: HTMLElement, index: number): HTMLButtonElement | undefined {
  return [...host.querySelectorAll<HTMLButtonElement>('.game-list .game-list-item')][index];
}

/** Select a game from the rail by its rendered title (default study language: Japanese). */
async function pick(host: HTMLElement, id: GameId): Promise<boolean> {
  const items = [...host.querySelectorAll<HTMLButtonElement>('.game-list .game-list-item')];
  const title = t(arenaGameTitleKey(id, 'ja'));
  const entry = items.find((b) => b.querySelector('b')?.textContent === title);
  if (!entry) return false;
  await click(entry);
  return true;
}

async function start(host: HTMLElement): Promise<void> {
  const btn = host.querySelector<HTMLButtonElement>('.game-launch-panel > button.btn.primary');
  expect(btn, 'start button').toBeTruthy();
  await click(btn);
  await settle(20);
}

describe('Game Arena — axe-core', () => {
  it('the lobby, with the round options open', async () => {
    const { host } = await arena();
    expect(listItem(host, 0), 'game rail painted').toBeTruthy();
    expect(host.querySelector('.game-stage h3')?.textContent?.trim(), 'stage title').toBeTruthy();
    const options = host.querySelector<HTMLDetailsElement>('details.game-ready-options');
    if (!options) throw new Error('round options missing');
    await act(async () => {
      options.open = true;
    });
    await settle(10);
    expect(await a11yViolations(host)).toEqual([]);
  });

  it.each(ROUND_GAMES)('first round: %s', async (id) => {
    const { host } = await arena();
    expect(await pick(host, id), `rail entry for ${id}`).toBe(true);
    await start(host);
    expect(host.querySelector('.game-round-shell'), 'round painted').not.toBeNull();
    expect(host.querySelector('.game-round-shell')?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    expect(await a11yViolations(host)).toEqual([]);
  });

  it('a typed round after the answer is revealed', async () => {
    const { host } = await arena();
    expect(await pick(host, 'kana-sprint')).toBe(true);
    await start(host);
    const box = host.querySelector<HTMLTextAreaElement>('.game-answer-box');
    if (!box) throw new Error('kana sprint did not reach a typed round');
    await typeInto(box, 'zzz');
    const check = host.querySelector<HTMLButtonElement>('.game-round > button.btn.primary');
    expect(check?.disabled, 'check enabled').toBe(false);
    await click(check);
    await settle(20);
    expect(host.querySelector('.game-verdict'), 'verdict painted').not.toBeNull();
    expect(await a11yViolations(host)).toEqual([]);
  });

  // The arcade games paint on a canvas jsdom cannot draw; their chrome (study
  // gate, controls, score line) is DOM and is audited here.
  it.each(ARCADE_GAMES)('arcade chrome: %s', async (id) => {
    localStorage.setItem('jp-wired-discovered-v1', '1');
    localStorage.setItem('jp-aero-discovered', '1');
    const { host } = await arena();
    expect(await pick(host, id), `rail entry for ${id}`).toBe(true);
    expect(host.querySelector('.game-stage')?.textContent?.trim().length ?? 0, 'panel painted').toBeGreaterThan(20);
    expect(await a11yViolations(host)).toEqual([]);
  });

  it('Mirror Writing', async () => {
    const { host } = await arena();
    expect(await pick(host, 'mirror-writing')).toBe(true);
    expect(host.querySelector('.game-stage')?.textContent?.trim().length ?? 0, 'panel painted').toBeGreaterThan(20);
    expect(await a11yViolations(host)).toEqual([]);
  });

  it('the result panel of a finished session', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let host!: HTMLDivElement;
    try {
      ({ host } = await arena());
      expect(await pick(host, 'word-match')).toBe(true);
      await start(host);
      expect(host.querySelector('.game-match-btn'), 'match round').not.toBeNull();
      // Run past the session limit so the expiry effect finishes it.
      await act(async () => {
        vi.advanceTimersByTime(5 * 12_000 + 2_000);
      });
    } finally {
      vi.useRealTimers();
    }
    await settle(20);
    expect(host.querySelector('.game-result h3')?.textContent?.trim(), 'result painted').toBeTruthy();
    expect(await a11yViolations(host)).toEqual([]);
  });
});
