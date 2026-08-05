# Phase 3 — Living Desktop Audit

Focused audit (not a repo-wide analysis) of the existing Living Desktop systems,
done before planning so Phase 3 completes/integrates rather than rebuilds.

**Headline:** the Living Desktop is **already mature** — 21 files under
`src/renderer/environment/`, a prior 29-fix engineering history + QA handbook
(`docs/IMMERSIVE_DESKTOP_LIVING_LAYER_DEBUG.md`, `docs/LIVING_DESKTOP_QA.md`), and
135 passing vitest tests. Almost every Phase-3 milestone concept already exists.

## Existing systems

| Subsystem | Files | Status |
|---|---|---|
| Environment manager / state / registry | `environmentStore.ts`, `types.ts`, `index.ts` | **Completed** |
| Wallpaper engine (rotation) | `WallpaperStage.tsx`, `schedules.ts`, `wallCatalog.ts` | **Completed** |
| Wallpaper **framework** (metadata registry) | `wallpaperFramework.ts` (Phase 1) | **Completed but UNCONNECTED** |
| Transitions | `WallpaperStage.tsx` (cut/fade/crossfade + ms, reduce-motion) | **Completed** |
| Particle engine (+ **fireflies**) | `particleEngine.ts`, `ParticleLayer.tsx` (7 presets) | **Completed** |
| Lighting / day-night | `dayCycleLighting.ts`, `DayCycleLightingLayer.tsx` | **Completed** (polish) |
| Time-of-day | `schedules.ts` rules + `dayCycleLighting` | **Completed** |
| Companions | `companionCatalog.ts`, `CompanionLayer.tsx`, `buddyRoutines.ts`, `companionEvents.ts`, `CompanionHostView.tsx`, `companionOsBridge.ts`, `achievements.ts`, `noctisLightBridge.ts` | **Completed** (integration polish) |
| Settings | `settings/pages/AtmospherePage.tsx`, `CompanionsPage.tsx`, `PlaylistEditor.tsx` + `patchEnv` | **Completed** |
| Persistence | `environmentStore.ts` (`jp-os-environment-v1`) | **Completed** |
| Desktop integration | `EnvironmentStack.tsx` mounted in `DesktopShell.tsx` | **Completed** |
| Extension hooks | `shellExtensions.ts`/`DesktopLayerHost` (Phase 2), `noctis:pulse`, `companionEvents` | **Completed** |
| **Ambient audio** (environment) | — | **Missing** |
| **Weather runtime** | declarative `WeatherLayer` stub in `wallpaperFramework.ts`; rain/snow = particles | **Partial** |

## Feature status

- **Completed:** environment store/state, wallpaper rotation + transitions, particle
  engine + fireflies/rain/snow/dust/leaves/stars/magic, day-cycle lighting,
  time-of-day rules, companions (types/routines/reactions/OS host/achievements),
  atmosphere & companion settings, persistence, desktop mount, perf tiers, reduce-
  motion + hidden-tab pause.
- **Mostly complete:** lighting (works; interpolation/temperature could be smoother).
- **Partial:** weather (rain/snow only, via particles; no fog/cloud/wind/engine);
  `wallpaperFramework` (fully built registry, but nothing reads its
  `timeAware`/`weather`/`particles`/`renderer` metadata).
- **Missing:** ambient audio in the environment layer; Aero-mode auto-enable;
  `session-complete`/`new-day` lifecycle events; cohesive multi-system presets; the
  8 Phase-3 docs + a Phase-3 QA doc.

## Architecture review

- **Duplicate systems:** none found. Phase 3 must not add any.
- **Two perf scales coexist by design** (not duplication): `env.performanceTier`
  (`off|low|medium|high`, gates env detail) vs the global `data-perf`
  (`performance|balanced|atmosphere|battery`, from `theme/perf.ts`). New effects must
  honour **both**.
- **Technical debt / missing integration (the main finding):** `wallpaperFramework.ts`
  is a complete registry with rich metadata but **has zero runtime readers** — the
  applied/rotated wallpaper flows through `wallCatalog`/`schedules`/`WallpaperStage`,
  which never import the framework. Its `timeAware`/`weather`/`particles`/`renderer`
  fields are declarative-only. This is the one architectural gap to close (M1).
- **Unused code:** the framework metadata fields above.
- **Performance:** the whole layer is opt-in (`env.enabled` default false). New
  layers (weather/audio) must honour both perf scales, pause on hidden tab, and
  respect reduce-motion — matching the existing `ParticleLayer` discipline.

## Genuinely missing (do not invent beyond this)

1. Ambient audio — per-environment looping soundscapes via `soundEngine`
   `'environment'` (silent until a pack is added).
2. Weather runtime — fog/cloud/wind + a weather layer/engine; rain/snow already exist
   as particles and should be reused.
3. `wallpaperFramework` → runtime connector.
4. Cohesive environment presets bundling wallpaper+lighting+particles+weather+audio+
   companions+perf.
5. Aero secret-mode auto-enable (+ restore on exit).
6. `session-complete` / `new-day` lifecycle events (minor).
7. Phase-3 docs (8) + Phase-3 QA.

## Revised plan

See `PHASE_3_IMPLEMENTATION_PLAN.md`. Milestones are built **only** around the
genuinely-missing / partial / unconnected items above; everything Completed is
audited/verified and reused, never rebuilt.
