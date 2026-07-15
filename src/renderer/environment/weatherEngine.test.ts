import { describe, expect, it } from 'vitest';
import { resolveWeather } from './weatherEngine';
import { DEFAULT_ENVIRONMENT, type EnvironmentSettings } from './types';

const base: EnvironmentSettings = DEFAULT_ENVIRONMENT;

describe('weatherEngine (Phase 3 · M3)', () => {
  it('off → nothing to render', () => {
    expect(resolveWeather({ ...base, weather: { mode: 'off', intensity: 0.5 } })).toEqual({ kind: 'clear', intensity: 0 });
  });

  it('forced kind passes through with clamped intensity', () => {
    expect(resolveWeather({ ...base, weather: { mode: 'fog', intensity: 0.7 } })).toEqual({ kind: 'fog', intensity: 0.7 });
    expect(resolveWeather({ ...base, weather: { mode: 'clear', intensity: 0.9 } })).toEqual({ kind: 'clear', intensity: 0 });
  });

  it('auto derives from the active wall framework weather (snow preset)', () => {
    const r = resolveWeather({ ...base, weather: { mode: 'auto', intensity: 0.5 } }, 'snow');
    expect(r.kind).toBe('snow');
    expect(r.intensity).toBeGreaterThan(0);
  });

  it('auto with no framework weather → nothing', () => {
    expect(resolveWeather({ ...base, weather: { mode: 'auto', intensity: 0.5 } }, 'dawn')).toEqual({ kind: 'clear', intensity: 0 });
  });
});
