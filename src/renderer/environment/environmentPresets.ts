/**
 * Environment presets (Phase 3 · M2) — cohesive "places" that bundle the living
 * layers (particles + weather + lighting + ambient audio + rotation + perf) into
 * one click. Applying a preset is just a `saveEnvironment(patch)` over the
 * existing store — it does NOT touch the master `enabled` flag (the user or
 * Secret Mode controls that), so it configures the world without forcing it on.
 *
 * Presets compose EXISTING systems only — no new rendering. Wallpaper stays the
 * user's gradient/rotation choice (there are no bundled themed images); the
 * atmosphere layers are what make each preset feel distinct.
 *
 * Pure data (no side-effect imports) so it stays node-testable. Apply a preset by
 * spreading `preset.patch` (+ environmentPresetId) into `saveEnvironment` /
 * `patchEnv` at the call site — see the settings picker (M9) and Secret Mode (M8).
 */
import type { EnvironmentSettings } from './types';

export interface EnvironmentPreset {
  id: string;
  label: string;
  description: string;
  /** Partial applied over the current environment. */
  patch: Partial<EnvironmentSettings>;
}

export const ENVIRONMENT_PRESETS: EnvironmentPreset[] = [
  {
    id: 'night-sky',
    label: 'Night Sky',
    description: 'Stars and fireflies drifting under a deep, calm night.',
    patch: {
      rotationEnabled: true,
      dayCycleLighting: true,
      lightingIntensity: 0.5,
      particlesEnabled: true,
      matchParticleSuggestions: false,
      particlePresets: ['stars', 'fireflies'],
      weather: { mode: 'off', intensity: 0.4 },
      ambientAudio: { enabled: true, volume: 0.4 },
      performanceTier: 'medium',
    },
  },
  {
    id: 'forest',
    label: 'Forest',
    description: 'Fireflies and falling leaves through a soft evening haze.',
    patch: {
      rotationEnabled: true,
      dayCycleLighting: true,
      lightingIntensity: 0.5,
      particlesEnabled: true,
      matchParticleSuggestions: false,
      particlePresets: ['fireflies', 'leaves'],
      weather: { mode: 'fog', intensity: 0.25 },
      ambientAudio: { enabled: true, volume: 0.45 },
      performanceTier: 'medium',
    },
  },
  {
    id: 'ocean',
    label: 'Ocean',
    description: 'Soft drifting clouds over calm, glinting water light.',
    patch: {
      rotationEnabled: true,
      dayCycleLighting: true,
      lightingIntensity: 0.4,
      particlesEnabled: true,
      matchParticleSuggestions: false,
      particlePresets: ['magic'],
      weather: { mode: 'clouds', intensity: 0.3 },
      ambientAudio: { enabled: true, volume: 0.5 },
      performanceTier: 'medium',
    },
  },
  {
    id: 'future-city',
    label: 'Future City',
    description: 'Floating lights and a gentle holographic shimmer.',
    patch: {
      rotationEnabled: true,
      dayCycleLighting: true,
      lightingIntensity: 0.55,
      particlesEnabled: true,
      matchParticleSuggestions: false,
      particlePresets: ['stars', 'dust'],
      weather: { mode: 'clouds', intensity: 0.2 },
      ambientAudio: { enabled: true, volume: 0.4 },
      performanceTier: 'high',
    },
  },
  {
    id: 'floating-islands',
    label: 'Floating Islands',
    description: 'Dreamlike motes drifting above a bright open sky.',
    patch: {
      rotationEnabled: true,
      dayCycleLighting: true,
      lightingIntensity: 0.45,
      particlesEnabled: true,
      matchParticleSuggestions: false,
      particlePresets: ['dust', 'magic'],
      weather: { mode: 'clouds', intensity: 0.25 },
      ambientAudio: { enabled: true, volume: 0.4 },
      performanceTier: 'medium',
    },
  },
  {
    id: 'japanese-garden',
    label: 'Japanese Garden',
    description: 'Falling leaves and a quiet, unhurried calm.',
    patch: {
      rotationEnabled: true,
      dayCycleLighting: true,
      lightingIntensity: 0.5,
      particlesEnabled: true,
      matchParticleSuggestions: false,
      particlePresets: ['leaves'],
      weather: { mode: 'off', intensity: 0.2 },
      ambientAudio: { enabled: true, volume: 0.5 },
      performanceTier: 'medium',
    },
  },
];

export function getEnvironmentPreset(id: string | undefined): EnvironmentPreset | undefined {
  return id ? ENVIRONMENT_PRESETS.find((p) => p.id === id) : undefined;
}

/** The patch to persist when applying a preset (spread into saveEnvironment). */
export function presetPatch(id: string): Partial<EnvironmentSettings> | undefined {
  const preset = getEnvironmentPreset(id);
  return preset ? { ...preset.patch, environmentPresetId: id } : undefined;
}
