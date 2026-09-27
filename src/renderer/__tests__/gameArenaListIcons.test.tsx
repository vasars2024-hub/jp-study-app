// @vitest-environment jsdom
/**
 * The Game Arena list showed the same die beside every language game (and one
 * sparkle beside every arcade game), so the rail could only be told apart by
 * reading it. Rendered for real: each entry carries its own glyph from the
 * shared icon set, and no two entries share one.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BASE_PATHS } from '../components/Icons';
import { GAME_ICONS } from '../games/gameIcons';
import { GAME_DEFINITIONS } from '../games/engine';

vi.mock('../i18n', () => ({
  useT: () => ({ t: (key: string) => key, lang: 'en' }),
}));
vi.mock('../components/Icons', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../components/Icons')>()),
  default: ({ name }: { name: string }) => <i data-icon={name} />,
}));
vi.mock('../motion/hooks', () => ({ useCountUp: (n: number) => n }));
vi.mock('../motion/rewardBurst', () => ({ fireRewardAt: vi.fn() }));

import { GameArena } from '../components/games/GameArenaContent';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('Game Arena list icons', () => {
  it('every listed game has its own glyph, and none is the generic die', async () => {
    await act(async () => root.render(<GameArena />));
    const items = [...host.querySelectorAll('.game-list-item')];
    expect(items.length).toBeGreaterThan(5);
    const icons = items.map((el) => el.querySelector('[data-icon]')?.getAttribute('data-icon') ?? '');
    expect(icons.every(Boolean)).toBe(true);
    expect(icons).not.toContain('dice');
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('the map covers every game with a distinct, real icon', () => {
    const names = GAME_DEFINITIONS.map((g) => GAME_ICONS[g.id]);
    expect(names.every((n) => n in BASE_PATHS)).toBe(true);
    expect(new Set(names).size).toBe(GAME_DEFINITIONS.length);
    expect(names).not.toContain('dice');
  });
});
