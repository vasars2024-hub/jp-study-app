import { describe, expect, it } from 'vitest';
import { ENVIRONMENT_PRESETS, getEnvironmentPreset } from './environmentPresets';

const VALID_PARTICLES = new Set(['fireflies', 'rain', 'snow', 'dust', 'leaves', 'stars', 'magic']);
const VALID_WEATHER = new Set(['off', 'auto', 'clear', 'rain', 'snow', 'fog', 'clouds']);

describe('environmentPresets (Phase 3 · M2)', () => {
  it('has the six showcase presets', () => {
    expect(ENVIRONMENT_PRESETS.map((p) => p.id)).toEqual(
      expect.arrayContaining(['night-sky', 'forest', 'ocean', 'future-city', 'floating-islands', 'japanese-garden']),
    );
  });

  it('getEnvironmentPreset resolves by id', () => {
    expect(getEnvironmentPreset('forest')?.label).toBe('Forest');
    expect(getEnvironmentPreset('nope')).toBeUndefined();
    expect(getEnvironmentPreset(undefined)).toBeUndefined();
  });

  it('every preset uses valid particle + weather values and has copy', () => {
    for (const p of ENVIRONMENT_PRESETS) {
      for (const pr of p.patch.particlePresets ?? []) expect(VALID_PARTICLES.has(pr)).toBe(true);
      if (p.patch.weather) expect(VALID_WEATHER.has(p.patch.weather.mode)).toBe(true);
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
    }
  });
});
