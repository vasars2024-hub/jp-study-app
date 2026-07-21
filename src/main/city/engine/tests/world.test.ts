// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { projectCityPresentation } from '../presentation';
import { createInitialState } from '../state';
import { ERA_ORDER, type EraDesignation } from '../types';
import {
  buildNoctisWorld,
  containsWorldRect,
  fitWorldRect,
} from '../../rendering/world/worldModel';

function worldAt(era: EraDesignation) {
  const state = createInitialState(17);
  const rank = ERA_ORDER.indexOf(era);
  state.era.designation = era;
  state.era.history = ERA_ORDER.slice(0, rank + 1);
  return buildNoctisWorld(projectCityPresentation(state));
}

describe('Noctis navigable world projection', () => {
  it('keeps the first era cramped and expands without losing older space', () => {
    const worlds = ERA_ORDER.map(worldAt);
    expect(worlds.map((world) => world.regions.length)).toEqual([1, 3, 4, 5, 6]);
    expect(worlds[0].revealedBounds).toEqual({ x: 1200, y: 920, width: 1200, height: 860 });
    worlds.slice(1).forEach((world, index) => {
      expect(containsWorldRect(world.revealedBounds, worlds[index].revealedBounds)).toBe(true);
    });
  });

  it('reveals only era-appropriate explorer stops', () => {
    const eraOne = worldAt('SPORE_HEARTH');
    const eraFive = worldAt('COSMIC_STELLAR');
    expect(eraOne.focuses.map((focus) => focus.id)).toEqual([
      'ancestral_hearth',
      'ordinary_shelters',
      'noctae_gathering',
      'first_current',
      'fungal_canopy',
      'basin_ridges',
      'living_root_paths',
      'root_mouth',
    ]);
    expect(eraFive.focuses).toHaveLength(14);
    expect(eraFive.focuses.some((focus) => focus.stratum === 'stellar')).toBe(true);
  });

  it('fits the complete revealed world to the viewport without cropping it', () => {
    const world = worldAt('COSMIC_STELLAR');
    const camera = fitWorldRect(world.revealedBounds, 16 / 9, 0.08);
    expect(camera.width / camera.height).toBeCloseTo(16 / 9, 8);
    expect(containsWorldRect(camera, world.revealedBounds)).toBe(true);
  });
});
