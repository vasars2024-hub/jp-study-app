# Living Desktop — QA (Phase 3)

Phase-3 QA for the living-environment completion. Complements the pre-existing
`docs/LIVING_DESKTOP_QA.md` (the mature system's handbook) — it is not replaced.

## Executive summary

Phase 3 **audited** a mature living-desktop system and **completed the genuine gaps**
(framework connector, environment presets, weather runtime, ambient audio, Secret-Mode
auto-enable, lighting/atmosphere polish, companion environment-awareness) — reusing
every existing system, no duplication, no rewrites of tested code. Delivered as small,
verified commits (`feat/perf/docs(phase3): M0…M13`). All edits to `environment/*` are
additive; the vitest suite grew from 140 → 151 and stayed green throughout.

## Feature status

| Feature | Status | Notes |
|---|---|---|
| Environment manager / store / persistence | Reused | additive `weather`/`ambientAudio`/`environmentPresetId` fields |
| Wallpaper engine + transitions | Reused | unchanged |
| Framework → runtime connector | **New (M1)** | `frameworkBridge.ts`; metadata now drives particles/weather |
| Particle engine + fireflies | Reused | now prefers framework particle metadata |
| Time-of-day + lighting | Reused + **polished (M5)** | eased phase transitions |
| Weather runtime | **New (M3)** | fog/clouds/rain/snow CSS field + engine |
| Ambient audio | **New (M4)** | soundEngine `playLoop`; silent until a pack |
| Environment presets | **New (M2)** | 6 cohesive places |
| Atmosphere depth/bloom | **New (M6)** | Aero-only |
| Companions | Reused + **integrated (M7)** | `environment` reaction kind |
| Secret-Mode auto-enable | **New (M8)** | enable + restore prior state |
| Settings (weather/audio/presets) | **New (M9)** | AtmospherePage cards |

## Performance results

- vitest **19 files / 151 passing** (framework bridge, weather engine, presets +
  pre-existing shared suite). Fast (~0.8s).
- New layers add **no canvas** (weather + atmosphere are CSS); ambient audio is silent
  (no decode) until a pack loads. Both perf scales honoured (`env.performanceTier` +
  `data-perf`); Battery Saver collapses the new animations + suppresses env audio.
- Full runtime soak matrix (long session / sleep-wake / many particles / multi-monitor)
  = the manual checklist in `docs/LIVING_DESKTOP_QA.md` (unchanged; hardware-only).

## Memory results

- `WeatherLayer` clears its interval + visibility listener on unmount; `ambientAudio`
  stops/disconnects loop handles; `soundEngine.playLoop` disconnects nodes on stop. No
  new retained timers or audio nodes. Particle teardown unchanged.

## Accessibility audit

- Weather layer `aria-hidden`; atmosphere depth `pointer-events: none`.
- Reduced motion freezes weather drift + eases lighting; honoured globally.
- Hidden-tab pause on weather (parity with particles).
- New settings controls are native buttons/inputs with labels; keyboard-operable.
- No colour-only signalling introduced. No regressions.

## Integration audit

- One store, one stack: all new state on `EnvironmentSettings`, all new layers inside
  `EnvironmentStack`, gated by `env.*`. No second stack/store/config.
- Framework metadata is now read by the runtime (was dead code).
- Secret Mode routes through the Theme Engine + env store; restores prior state.
- Ambient audio routes through the existing sound engine (`environment` category).

## Bug fixes

- Fixed a node-test import failure: `environmentPresets.ts` transitively pulled a
  window-touching module (`knownWords`); made presets pure data so the suite collects
  cleanly (widened vitest include for `environment/**/*.test.ts`).

## Remaining technical debt

- No bundled wallpapers/audio, so presets keep gradient wallpapers and ambient audio
  is silent until packs are added.
- `frameworkBridge` enriches only the built-in presets; live (`renderer`) wallpapers
  aren't rendered yet.
- The env layer still isn't broadly unit-tested (only pure Phase-3 logic is); component
  behaviour relies on Vite-transform + manual runtime checks.

## Future phase recommendations

Themed/live wallpapers + a bundled ambient sound pack; weather → lighting/audio
coupling; richer companion autonomy/dialogue; outside-app presence; Anime Edition asset
pack. All build on the seams established here.

## Manual check owed (Electron)

Verified structurally + by tests; confirm visually in the packaged app: enter Aero →
living layer activates (wallpaper/lighting/particles/weather/ambience) and restores on
exit; toggle presets/weather in Settings → Atmosphere.
