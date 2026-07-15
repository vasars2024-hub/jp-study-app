# Environment Performance Guide

The living desktop is "beautiful but lightweight." Two perf scales govern it — honour
**both** in any new effect.

## The two scales

1. **`env.performanceTier`** (`off | low | medium | high`) — the environment-local
   detail scale. Gates the whole stack (`off` unmounts particles/weather) and caps
   particle counts + canvas DPR (`particleEngine` / `ParticleLayer`).
2. **Global `data-perf`** (`performance | balanced | atmosphere | battery`, from
   `theme/perf.ts`) — the OS-wide tier. **Battery Saver** collapses CSS animations
   (`perf.css` `*` rule), drops backdrop-filters, and makes `soundEngine.perfAllows`
   suppress the `environment`/`companion` audio categories.

The living layer is also **opt-in** (`env.enabled` default false) — zero cost until
enabled.

## Discipline for effects (what Phase 3 followed)

- **Gate** on `env.enabled` + the relevant `env.*` flag + `performanceTier !== 'off'`;
  bail under `data-perf === 'battery'` for ambient/heavy work.
- **Pause when hidden** — particles and the weather layer stop animating while the tab
  is hidden (`visibilitychange`).
- **Reduced motion** — freeze drift/animation (`os-weather-still`, `data-display-anim`,
  a11y.css globals).
- **No leaks** — clear intervals, disconnect audio nodes, stop rAF loops on unmount
  (see `WeatherLayer` cleanup, `ambientAudio` stop, `ParticleLayer` teardown).
- **Prefer CSS/compositor** — weather + atmosphere depth are pure CSS (no canvas);
  particles use a single adaptive-budget canvas via `perfHub`.

## Measured characteristics

- vitest suite: **19 files / 151 tests** green (pure logic: framework bridge, weather
  engine, presets, plus the pre-existing shared suite).
- New layers add no canvas; weather/atmosphere are cheap CSS gradients. Ambient audio
  is silent (no decoding) until a pack is added.
- Battery Saver + reduced motion verified to collapse the new animations.

Full runtime CPU/GPU/memory soak matrix (long session / sleep-wake / many particles /
multi-monitor) is the manual checklist in `docs/LIVING_DESKTOP_QA.md`.
