# Environment Engine

Sources: `environment/environmentStore.ts`, `types.ts`, `WallpaperStage.tsx`,
`schedules.ts`, `frameworkBridge.ts`.

## State & persistence

`EnvironmentSettings` (`types.ts`) is the single source of truth (~35 fields):
master `enabled`, `performanceTier` (off/low/medium/high), particles
(enabled/density/intensity/size/presets/matchSuggestions/snowAccumulation),
companions (types/reactivity/instances/routines), rotation (playlists/
activePlaylistId/rules/calendarWalls), lighting (dayCycleLighting/lightingIntensity),
achievements — plus the Phase-3 additions **weather**, **ambientAudio**, and
**environmentPresetId**.

- Persisted to `localStorage['jp-os-environment-v1']`.
- `loadEnvironment()` reads + `normalize()`s (validates/clamps/migrates — merges new
  default day-cycle items into older saves).
- `saveEnvironment(partial)` merges over the current, normalizes, persists, and
  broadcasts `jp-os-environment-changed`.
- `onEnvironmentChanged(cb)` subscribes. `patchEnv` in the settings controller wraps
  `saveEnvironment`.

**Extending state** (the sanctioned path, used by Phase 3): add the field to
`EnvironmentSettings` + `DEFAULT_ENVIRONMENT` (types.ts) and add a validated line to
`normalize()` (environmentStore.ts). Always additive; never remove fields.

## Wallpaper engine + transitions

`WallpaperStage.tsx` double-buffers two layers (preset CSS gradient / image / video)
and transitions between them: `cut` / `fade` / `crossfade` with per-playlist
`transitionMs`. Reduced motion forces `cut` + 0ms. `schedules.ts` `resolveWall(env)`
picks the active wall from playlists + time-of-day + calendar-priority rules on a
~30s tick. Only mounts when `enabled && rotationEnabled`.

## Framework connector (Phase 3 · M1)

`frameworkBridge.ts` bridges the Phase-1 `wallpaperFramework.ts` registry (rich
`WallpaperDefinition` metadata) into the runtime — previously the metadata had zero
readers. It enriches the built-in presets with particle/weather metadata (registered
additively) and exposes pure queries:

- `wallDefinition(ref)` — the framework definition for a wall ref.
- `particlesForWall(ref)` — framework particle types → runtime `ParticlePresetId[]`
  (consumed by `ParticleLayer` when match-suggestions is on).
- `weatherForWall(ref)` — framework weather (consumed by the weather engine's `auto`).
- `timeAwareCss(ref, phase)` — per-time-of-day CSS override.

Reuses the existing registry — no second wallpaper system.
