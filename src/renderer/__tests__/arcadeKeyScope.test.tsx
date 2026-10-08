// @vitest-environment jsdom
//
// The arcade's key handling listens on `window`. It must not cancel Space or
// arrows typed into a text field anywhere in the app while a game is mounted.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../stats', () => ({ recordGameResult: vi.fn() }));

import { arcadeIgnoresKeyTarget } from '../games/ArcadeGames';

describe('arcade key scope', () => {
  it('ignores text fields and controls that own their arrows', () => {
    const input = document.createElement('input');
    const area = document.createElement('textarea');
    const select = document.createElement('select');
    const slider = document.createElement('div');
    slider.setAttribute('role', 'slider');
    const editableHost = document.createElement('div');
    editableHost.setAttribute('contenteditable', 'true');
    const inner = document.createElement('span');
    editableHost.appendChild(inner);
    document.body.append(input, area, select, slider, editableHost);
    for (const el of [input, area, select, slider, inner]) {
      expect(arcadeIgnoresKeyTarget(el)).toBe(true);
    }
  });

  it('still handles keys on the page body and game elements', () => {
    const game = document.createElement('div');
    game.className = 'arcade-game';
    document.body.appendChild(game);
    expect(arcadeIgnoresKeyTarget(document.body)).toBe(false);
    expect(arcadeIgnoresKeyTarget(game)).toBe(false);
    expect(arcadeIgnoresKeyTarget(window)).toBe(false);
    expect(arcadeIgnoresKeyTarget(null)).toBe(false);
  });
});
