# Living Environment (Phase 3)

The desktop as a *place*: an opt-in atmosphere layer over the wallpaper. Phase 3
**completed and integrated** an already-mature system rather than rebuilding it —
see `PHASE_3_AUDIT.md`. This is the hub doc.

- [ENVIRONMENT_ENGINE.md](ENVIRONMENT_ENGINE.md) · [WEATHER_RUNTIME.md](WEATHER_RUNTIME.md) · [AMBIENT_AUDIO.md](AMBIENT_AUDIO.md)
- [LIGHTING_SYSTEM.md](LIGHTING_SYSTEM.md) · [COMPANION_INTEGRATION.md](COMPANION_INTEGRATION.md) · [ENVIRONMENT_PRESETS.md](ENVIRONMENT_PRESETS.md)
- [PERFORMANCE_GUIDE.md](PERFORMANCE_GUIDE.md) · [LIVING_DESKTOP_QA.md](LIVING_DESKTOP_QA.md)
- Prior engineering history: `docs/IMMERSIVE_DESKTOP_LIVING_LAYER_DEBUG.md`, `docs/LIVING_DESKTOP_QA.md`.

## Architecture

One store, one stack. `EnvironmentStack` (`environment/EnvironmentStack.tsx`) is
mounted once in `DesktopShell` and renders **nothing** unless `env.enabled`:

```
EnvironmentStack  (env.enabled)
├── WallpaperStage        (rotationEnabled)        L1  wallpaper rotation + transitions
├── DayCycleLighting      (dayCycleLighting)       L5  time-of-day colour wash
├── WeatherLayer          (weather.mode ≠ off)     ·   atmospheric fog/cloud/rain/snow  ← Phase 3
├── ParticleLayer         (particlesEnabled)       L2  fireflies/rain/snow/… canvas
└── CompanionLayer        (companionsEnabled)      L3  desktop companions
+ atmosphere.css ::after depth/bloom (Aero only)                                        ← Phase 3
```

All layers are gated by `env.*` flags and read one persisted store
(`jp-os-environment-v1`). State flows `patchEnv` → `saveEnvironment` →
`jp-os-environment-changed` event → every subscriber (stack, settings, OS bridge,
ambient audio). No duplicate state, no per-theme stack.

## What Phase 3 added (gaps only)

- **Weather runtime** — `weatherEngine.ts` + `WeatherLayer.tsx` (was a stub).
- **Ambient audio** — `ambientAudio.ts` via `soundEngine.playLoop` (was missing).
- **Framework connector** — `frameworkBridge.ts` wires the Phase-1 wallpaper
  framework metadata (particles/weather) into the runtime (was dead code).
- **Environment presets** — `environmentPresets.ts` (cohesive "places").
- **Secret-Mode auto-enable** — entering Aero enables + restores the layer.
- **Polish** — eased lighting transitions; Aero depth/bloom.
- **Companion awareness** — a new `environment` reaction kind.

Everything else (rotation, transitions, particles, fireflies, day-cycle lighting,
companions, OS host) pre-existed and was audited/reused, not rebuilt.

## Enabling it

Off by default (`env.enabled = false`). Turn it on in **Settings → Atmosphere →
Living desktop layer**, or enter Secret Mode (double-click the bottom-right corner
/ type "aero") which enables it automatically and restores your prior state on exit.
