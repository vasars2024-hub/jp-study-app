# Environment Presets (Phase 3 · M2)

Source: `environment/environmentPresets.ts`.

Cohesive "places" that bundle the living layers — particles + weather + lighting +
ambient audio + rotation + perf tier — into one click, so the desktop feels like a
place rather than a pile of toggles.

## The presets

Night Sky · Forest · Ocean · Future City · Floating Islands · Japanese Garden. Each
is an `EnvironmentPreset { id, label, description, patch }` where `patch` is a
`Partial<EnvironmentSettings>` composed of **existing** systems only (no new
rendering). Example (Forest): fireflies + leaves, fog weather, day-cycle lighting,
ambient enabled, medium perf.

## Applying

`environmentPresets.ts` is **pure data** (no side-effect imports, so it stays
node-testable). Apply a preset by spreading the patch into the store at the call site:

- Settings picker: `patchEnv({ ...presetPatch(id), enabled: true })` (Atmosphere →
  Environment). Also emits an `environment` companion event.
- Secret Mode: `saveEnvironment({ enabled: true, ...presetPatch('floating-islands') })`
  when entering Aero (only if the layer was off — non-destructive).

A preset **never** sets the master `enabled` flag itself; the caller decides. The
active preset id is tracked in `env.environmentPresetId`.

## Wallpaper note

There are no bundled themed images, so presets keep the user's gradient/rotation
choice — the atmosphere layers (particles/weather/lighting/audio) are what make each
preset distinct. A future phase can attach themed wallpapers by adding
`WallpaperDefinition`s (with a `renderer` for live scenes) and referencing them from a
preset.

## Extending

Append an `EnvironmentPreset` to `ENVIRONMENT_PRESETS` (validated by
`environmentPresets.test.ts`). Reuse existing particle/weather/lighting fields.
