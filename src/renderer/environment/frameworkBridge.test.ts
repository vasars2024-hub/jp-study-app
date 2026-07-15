import { describe, expect, it } from 'vitest';
import { particlesForWall, wallDefinition, weatherForWall } from './frameworkBridge';

describe('frameworkBridge (Phase 3 · M1 connector)', () => {
  it('maps framework particle metadata to runtime presets', () => {
    expect(particlesForWall('night')).toEqual(expect.arrayContaining(['fireflies', 'stars']));
    expect(particlesForWall('snow')).toContain('snow');
  });

  it('returns [] for walls without particle metadata or unknown refs', () => {
    expect(particlesForWall('dawn')).toEqual([]);
    expect(particlesForWall('does-not-exist')).toEqual([]);
    expect(particlesForWall(undefined)).toEqual([]);
  });

  it('exposes weather metadata for enriched presets only', () => {
    expect(weatherForWall('snow').some((w) => w.type === 'snow')).toBe(true);
    expect(weatherForWall('dawn')).toEqual([]);
  });

  it('resolves the framework definition for a known preset', () => {
    expect(wallDefinition('night')?.id).toBe('night');
    expect(wallDefinition('nope')).toBeUndefined();
  });
});
