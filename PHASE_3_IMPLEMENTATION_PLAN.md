# Phase 3 — Living Desktop Completion · Implementation Plan

Built on the audit (`PHASE_3_AUDIT.md`): the Living Desktop is mature, so Phase 3
**audits, integrates, completes, polishes, and documents** — it never rebuilds or
duplicates. Milestones target only the genuinely missing / partial / unconnected
work.

## Guiding principles

- **Extend, never duplicate.** New persisted state → additive fields on
  `EnvironmentSettings` (`environment/types.ts`) + `DEFAULT_ENVIRONMENT` +
  `normalize()` (`environment/environmentStore.ts`). New visual layers mount **inside
  `EnvironmentStack`** (the L1–L5 convention), gated by `env.*`. No second stack,
  store, or config; the `DesktopLayer` registry is not used for these.
- **Ambient audio = infrastructure, silent by default** — routes through the
  existing `soundEngine` `'environment'` category; no bundled/downloaded audio.
- **Aero auto-enable is reversible** — remember prior `env.enabled`, restore on exit.
- **Protect tested code** — additive edits to `environment/*`; run the vitest suite
  each milestone (the ~135 tests stay green). Small commits, stage only my hunks,
  leave the concurrent Lockscreen work untouched.
- **Honour both perf scales** (`env.performanceTier` + global `data-perf`) + reduce-
  motion + hidden-tab pause in every new effect.

## Milestones

| # | Milestone | Type | Status |
|---|---|---|---|
| M0 | Audit + plan docs | doc | ✅ |
| M1 | `wallpaperFramework` → runtime connector (`frameworkBridge.ts`) | build | ⬜ |
| M2 | Environment presets (`environmentPresets.ts` + picker) | build (data) | ⬜ |
| M3 | Weather runtime (`weatherEngine.ts` + `WeatherLayer.tsx`) | build | ⬜ |
| M4 | Ambient audio (`ambientAudio.ts`) | build | ⬜ |
| M5 | Lighting polish (`dayCycleLighting.ts`) | polish | ⬜ |
| M6 | Atmosphere polish (transitions/depth/micro-motion) | polish | ⬜ |
| M7 | Companion integration (audit + fix + new reactions) | audit/fix | ⬜ |
| M8 | Secret-Mode auto-enable + restore | build | ⬜ |
| M9 | Settings (weather/audio/preset controls in AtmospherePage) | build | ⬜ |
| M10 | Performance audit | verify | ⬜ |
| M11 | Accessibility audit | verify | ⬜ |
| M12 | Docs (8, in `docs/frutiger-aero/`) | doc | ⬜ |
| M13 | QA (`docs/frutiger-aero/LIVING_DESKTOP_QA.md`) | doc | ⬜ |

## Extension points (from the audit)

- `EnvironmentSettings` additive fields: `weather` (WeatherSettings), `ambientAudio`
  (AmbientAudioSettings), `environmentPresetId?`.
- New modules: `environment/{frameworkBridge,environmentPresets,weatherEngine,
  WeatherLayer,ambientAudio}.{ts,tsx}`.
- Reuse: `wallpaperFramework.ts`, `WallpaperStage.tsx`, `schedules.ts`,
  `particleEngine.ts`, `dayCycleLighting.ts`, `audio/soundEngine.ts`, `theme/perf.ts`,
  `companionEvents.ts`, and the `patchEnv`→`saveEnvironment`→`onEnvironmentChanged` bus.

## Verification

Vite 200 per module (renderer HMR) + the vitest suite each milestone (regression
guard) + manual Aero check (enter Aero → living layer activates + restores).

## Not doing (per brief)

Full companion characters, desktop pets, outside-app windows, Anime Edition, app
redesigns, Civilization/Noctis simulation, game mechanics.
