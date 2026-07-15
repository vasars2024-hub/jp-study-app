# Weather Runtime (Phase 3 · M3)

Sources: `environment/weatherEngine.ts`, `WeatherLayer.tsx`, `weather.css`.
Completes the weather gap (previously a declarative stub + rain/snow particles only).

## Model

- `env.weather: { mode, intensity }` (`types.ts`).
  - `mode`: `off` · `auto` · `clear` · `rain` · `snow` · `fog` · `clouds`.
  - `intensity`: 0–1 overlay strength.
- `resolveWeather(env, activeWallRef)` (**pure, unit-tested**) resolves the active
  weather:
  - `off`/`clear` → nothing.
  - `auto` → derived from the active wall's framework weather metadata (via
    `frameworkBridge.weatherForWall`).
  - a fixed kind → that kind at `intensity`.

## Rendering

`WeatherLayer.tsx` renders a **CSS-only** atmospheric field (no canvas):
fog (drifting haze), clouds (slow sideways gradients), rain (cool overcast +
diagonal streaks), snow (soft brightening). Opacity scales with intensity.
Precipitation *particles* remain the particle engine's job — the weather layer adds
the field + the shared state, so there is **no duplication**.

Mounted in `EnvironmentStack` when `weather.mode ≠ off && performanceTier ≠ off`.

## Performance & accessibility

- Drift animations freeze under reduced motion (`os-weather-still`) and while the tab
  is hidden; Battery Saver collapses them globally (`perf.css`).
- `aria-hidden`; `pointer-events: none`.
- A 60s re-resolve tick keeps `auto` weather following wallpaper rotation.

## Extending

Add a `WeatherKind`, a `.os-weather-<kind>` rule in `weather.css`, and (for `auto`) a
`weather` entry on the relevant `WallpaperDefinition`. Weather intended to influence
lighting/audio should read `resolveWeather(...)` — it is the single weather state.
