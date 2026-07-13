# Lighting System

Sources: `environment/dayCycleLighting.ts`, `DayCycleLightingLayer.tsx`,
`atmosphere.css` (Phase 3 · M5 easing).

## Time-of-day wash

`lightingForTime(now, intensity)` returns a soft gradient **overlay** (never
replaces the wallpaper) tuned per phase:

- `dawn` (05–08) — warm peach, soft-light blend.
- `day` (08–17) — faint cool/warm, very low opacity.
- `dusk` (17–21) — purple→amber→indigo, soft-light.
- `night` (21–05) — deep blue, multiply blend.

Opacity scales with `env.lightingIntensity` (0–1). `DayCycleLightingLayer` applies it
on a 60s tick, gated by `env.dayCycleLighting`. `dayPhaseAt` / `dayProgress` expose
the phase + continuous progress.

## Phase 3 polish (M5)

Phase changes previously snapped. `atmosphere.css` adds
`.os-day-lighting { transition: opacity 1.6s ease }` so the overlay settles softly
across a phase change (the gradient still swaps, but the fade hides the seam). This
is additive CSS — the lighting math is unchanged.

## Extending

Add a phase or retune a gradient in `lightingForTime`. Keep it an overlay (alpha < 1)
so the wallpaper always shows through, and keep opacities modest so the desktop stays
readable. Weather can dim/tint lighting by reading `resolveWeather(...)`.
