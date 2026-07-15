# Performance

Source: `src/renderer/theme/perf.ts` + `theme/perf.css`. Beautiful effects
(backdrop blur, animation, ambience) degrade gracefully via a `data-perf`
attribute on `<html>`.

## Tiers

| Tier | `data-perf` | Blur | Motion | Ambient sound |
|---|---|---|---|---|
| Maximum Atmosphere | `atmosphere` | richest (26px glass) | full | full |
| Balanced (default) | `balanced` | normal | full | full |
| Performance | `performance` | light (≤10px) | full | full |
| Battery Saver | `battery` | **off** (opaque glass) | **off** | **suppressed** |

`balanced` applies no overrides. `battery` disables `backdrop-filter` on all glass
surfaces (tints go opaque so they stay legible), collapses animation/transition to
~0, and the sound engine suppresses `environment`/`companion` categories.

## API

```ts
import { setPerfTier, loadPerfTier, onPerfChanged, bootPerf, PERF_TIERS } from './theme/perf';
setPerfTier('battery');   // apply + persist (localStorage 'jp-os-perf-tier') + broadcast
```

`bootPerf()` runs in `main.tsx` pre-paint. A settings toggle calls `setPerfTier`.
The tier is read by `perf.css`, the sound engine (`data-perf`), and the future
environment layer.

## Guidance for new effects
- Drive blur from `--glass-blur` / `--blur-*` (they shrink at lower tiers) rather
  than literal radii.
- Gate expensive ambient/particle work on the tier (`document.documentElement
  .getAttribute('data-perf')`), matching the sound engine's `battery` behaviour.
- Prefer transforms/opacity for animation; use the `.anim-*` utilities so
  reduced-motion + battery collapse them automatically.
- Backdrop-filter is the dominant GPU cost — the biggest single win on weak
  hardware is Battery Saver dropping it.
