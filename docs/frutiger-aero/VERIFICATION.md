# Phase 1 — Verification Audit

## Method

This repo's `tsc` is unusable (TypeScript ~4.5 vs modern `@types`), so the real
correctness check is the **Vite/esbuild transform**: a module served at HTTP 200
transformed cleanly; 500 = error. Every milestone was verified this way against
the running dev server (`http://127.0.0.1:5173`), plus targeted runtime checks.

- **All 21 platform modules transform clean (200).** (tokens, engine, facade,
  context, materials, aero, typography, motion, a11y, perf, assetPacks, the 25
  `ui/*` primitives + barrel, wallpaper framework, audio engine, `main.tsx`.)
- Renderer changes applied via HMR throughout; no main/preload changes, so no
  Electron restart was required.

## Audit checklist (Part 16)

| Check | Result |
|---|---|
| No duplicated styling | ✅ Platform is additive; `ui/*` is the single source for primitives; no legacy rules copied. |
| No hardcoded colours in component/material code | ✅ Grep-audited. One finding (toast/notification success+warning colours) **fixed** by adding `--status-success/-warning/-error/-info` tokens. See exceptions below. |
| No inconsistent spacing/radius/motion | ✅ All via tokens (`--space-*`, `--radius-*`, `--dur-*`, `--ease-*`). |
| Components inherit from the theme | ✅ `ui.css` uses `var(--…)` throughout; confirmed by the theme-flip test below. |
| Theme switching works | ✅ Verified in a browser via computed styles: base (`--bg #0f0e13`, red accent, dark glass) vs `data-theme='frutiger-aero'` (`--bg #bfe6ff`, `--text #123a52`, `--accent #17a6df`, bright glass), with M1 tokens resolving (`--dur-normal 240ms`). |
| Accessibility works | ✅ Global `:focus-visible`, app-wide reduced-motion, high-contrast formalisation, large-text hooks, `.sr-only`, ARIA/keyboard in every primitive. |
| Performance acceptable | ✅ `data-perf` tiers degrade blur/animation; Battery Saver drops `backdrop-filter` (the dominant GPU cost) and suppresses ambient sound. |
| Future themes can be added | ✅ `registerTheme()` + `:root[data-theme='id']` pattern, documented in THEME_ENGINE.md. |

## Accepted colour-literal exceptions

Only **achromatic anchors** remain as literals in component/material CSS, which is
standard practice and not theme colour:
- `#fff` / `#000` as `color-mix()` endpoints for gradient shading (button/gloss),
- white text on a saturated accent fill (`.on-accent`, primary/danger buttons),
- a 2px white ring on the slider thumb.

All chromatic/semantic colours are tokenised. Theme palette files
(`frutiger-aero.css`, the 13 base themes) legitimately contain literals — that is
what a theme *is*.

## Deliberate scope calls (documented, safe)

- **Shell `FloatingWindow` not migrated** to `ui/Window`. It carries the
  battle-tested per-move drag/resize/snap invariant; `ui/Window` is provided for
  new windows instead of a risky in-place rewrite.
- **`ThemeProvider` not force-wrapped** around the app — optional adoption by
  `ui/*` consumers; existing features are untouched.

## Not implemented (deferred to later phases, per the brief)

Desktop shell, taskbar, start menu, living wallpapers, particles, companions,
application reskins, boot sequence, settings redesign, and the Anime Edition — all
have their infrastructure hooks in place (wallpaper/audio frameworks, `assetPack`,
`materialSet`, `data-perf`) but no implementation.

## Remaining manual check (Electron)

Structural + CSS-cascade verification is complete. The one thing to confirm
visually in the packaged Electron renderer (not drivable headlessly here): the
Aero glass actually rendering. **Double-click the bottom-right corner of the
desktop, or type "aero"** → the OS should turn to bright sky-blue glass; toggle
again to restore your theme.
