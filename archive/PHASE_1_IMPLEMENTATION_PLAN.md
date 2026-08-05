# Phase 1 — Frutiger Aero Core Platform · Implementation Plan

> Working milestone tracker for Phase 1. Guided by `FRUTIGER_AERO_OS_VISION.md`
> (Phase 0, canon — do not revisit). This phase builds **reusable infrastructure**
> only: theme engine, design tokens, materials, component library, and the wallpaper /
> audio / accessibility / performance frameworks. It does **not** build the desktop
> shell, particles, companions, boot sequence, app reskins, settings redesign, or the
> Anime Edition itself.

## Guiding principles

- **Formalize & extend, don't rewrite.** A real foundation already exists
  (`theme.ts`, `:root` tokens in `styles.css`, `osPersonalization.ts`,
  `environment/wallCatalog.ts`, `Icons.tsx`). Build on top of it; migrate hardcoded
  values incrementally. No big-bang rewrite of the 12.5k-line stylesheet or the 72
  existing feature components.
- **No new hardcoded colors.** All new code reads design tokens (`var(--…)`), never
  literal hex/rgba.
- **Additive components.** New primitives live in `components/ui/` and are used by new
  work; existing features are not force-migrated (the shell window chrome is migrated
  as the single reference adoption).
- **Every milestone: verify → commit → status.** Small, revertible commits.

## Verification method (this repo)

`tsc` is unusable here (TS 4.5 vs modern `@types`) — **never** use it. Instead:

- **Renderer health:** `Invoke-WebRequest http://127.0.0.1:5173/src/renderer/<file>`
  → HTTP 200 per changed/new module (500 = transform error). Probe `127.0.0.1`, not
  `localhost`.
- **App boot:** `Set-Location 'C:\Users\Arseniy\Projects\jp-study-app'; $env:PATH="C:\Program Files\nodejs;"+$env:PATH; npm start`
  (background). Healthy = 5 electron procs + dev server 200. **Main/preload edits
  require a full restart**; renderer edits hot-reload.
- **Smoke test:** hidden activation → Frutiger Aero applies (glass + Aero palette);
  toggle back → base Study OS intact; other themes still switch; reduce-motion stops
  animations.

## Git

Baseline commit `eafa4ac` (working app, source-only) on `master`. All Phase 1 work on
branch **`feat/frutiger-aero-platform`**, one commit per verified milestone.

---

## Milestones

Legend: status ☐ pending · ◐ in progress · ☑ done

### M0 — Gate & safety net ◐
- **Do:** author this plan; `git init` baseline; feature branch.
- **Files:** `PHASE_1_IMPLEMENTATION_PLAN.md`, `.gitignore` (ignore `dist/`, heavy
  `public/*` data blobs, stray junk).
- **Deps:** none.
- **Risks:** committing the ~1.4 GB data blobs — mitigated by `.gitignore` + a staged-set
  audit (verified 445 files / 6.7 MB, no blobs).
- **Acceptance:** baseline commit exists; branch created; this doc present.

### M1 — Token foundation ☐
- **Do:** add the missing token tiers as a new layer without disturbing the existing
  `:root`.
- **Files (new):** `src/renderer/theme/tokens.css` (typography scale
  `--font-size-*`/`--line-height-*`/`--font-weight-*`/`--font-display`; motion
  `--dur-*`/`--ease-*`; `--blur-*`; `--z-*`; elevation ramp; transparency),
  `src/renderer/theme/tokens.ts` (typed mirror + doc source of truth).
- **Files (edit):** `src/renderer/main.tsx` (import `tokens.css` before `styles.css`).
- **Deps:** M0.
- **Risks:** import-order/specificity clobbering existing vars — mitigated by additive-only
  var names (no redefinition of existing tokens).
- **Acceptance:** all new tokens resolve; app boots unchanged visually; modules 200.

### M2 — Theme Engine ☐
- **Do:** unify theming under one documented engine + React context; register the
  existing 13 themes through it; add metadata + versioning.
- **Files (new):** `src/renderer/theme/engine.ts`, `src/renderer/theme/ThemeContext.tsx`,
  `src/renderer/theme/themes.ts` (registry).
- **Files (edit/reconcile):** `src/renderer/theme.ts` (delegate to engine, keep back-compat
  API + `jp-theme-changed` event + `jp-os-theme` key), `src/renderer/osPersonalization.ts`
  (register as the runtime-token layer under the engine, unchanged behaviour).
- **Deps:** M1.
- **Risks:** breaking the pre-paint `bootTheme()`/`bootOsLook()` order in `main.tsx` →
  FOUC or wrong theme — mitigated by keeping boot functions and their call order intact.
- **Acceptance:** all 13 themes still switch and persist; `registerTheme` works; a new
  theme can be added without touching components.

### M3 — Materials + Frutiger Aero theme + hidden activation ☐
- **Do:** token-driven material utilities; the Aero theme; the secret switch.
- **Files (new):** `src/renderer/theme/materials.css` (`.mat-glass/-frosted/-gloss/-chrome/
  -plastic/-panel/-dialog/-overlay` + `.is-hover/-pressed/-disabled/-selected`).
- **Files (edit):** theme registry (add `frutiger-aero`, `hidden:true`, `data-materials="aero"`
  enablement), `styles.css` or a theme file (`:root[data-theme='frutiger-aero']` palette),
  `src/renderer/components/DesktopShell.tsx` (hidden activation affordance → engine
  `setTheme('frutiger-aero')`; kept OUT of the theme picker).
- **Deps:** M1, M2.
- **Risks:** the hidden trigger clashing with existing shell gestures — mitigated by an
  unobtrusive, documented trigger (e.g. a specific corner/logo interaction or key chord)
  guarded against accidental activation.
- **Acceptance:** hidden trigger applies Aero (glass + palette); Aero absent from the
  normal picker; toggling back restores base Study OS.

### M4 — Typography / Colour / Motion systems ☐
- **Files (new):** `src/renderer/theme/typography.css` (role classes), `theme/motion.css`
  (keyframes + `.anim-*` utilities), doc-ready palette in `tokens.ts`.
- **Files (edit):** none required beyond imports.
- **Deps:** M1.
- **Risks:** animation utilities ignoring reduced-motion — mitigated by wrapping every
  keyframe utility in the reduced-motion guard from M8 (land the guard here too).
- **Acceptance:** role classes render at the right scale; motion utilities animate and
  are killed under reduce-motion.

### M5a — Core UI primitives ☐ · M5b — Remaining primitives ☐
- **Files (new):** `src/renderer/components/ui/{Button,IconButton,Card,GlassCard,Panel,
  Window,Dialog,Input,Select,Checkbox,Toggle,Toolbar,Tooltip,Toast,Progress,ContextMenu,
  Tabs,SearchBox,Slider}.tsx` (M5a) then `{Sheet,Sidebar,TreeView,Dropdown,Notification,
  Breadcrumb}.tsx` (M5b), plus `ui/index.ts` barrel.
- **Files (edit):** `src/renderer/components/DesktopShell.tsx` (replace inline
  `FloatingWindow` chrome with `ui/Window` as the reference migration).
- **Deps:** M1–M4.
- **Risks:** regressing the desktop window drag/resize/snap (documented per-move
  drag-perf invariant: never `setState` per pointermove) — mitigated by preserving the
  existing ref-based drag pattern inside `ui/Window`.
- **Acceptance:** each primitive renders from tokens/materials, no hardcoded colors,
  keyboard + focus-visible + ARIA present; shell windows still drag/resize/snap.

### M6 — Wallpaper Framework ☐
- **Files (edit/extend):** `src/renderer/environment/wallCatalog.ts` (`WallpaperDefinition`
  metadata, registry API, packs, transitions, weather/particle interface stubs).
- **Deps:** M1.
- **Risks:** forking the existing `environment/` living-layer — mitigated by extending the
  existing catalog types, not replacing them.
- **Acceptance:** existing wallpapers still resolve/apply; new definitions + packs
  register; no environment behaviour change.

### M7 — Audio Framework ☐
- **Files (new):** `src/renderer/audio/soundEngine.ts`, `audio/soundPack.ts` (manifest
  types), `public/sounds/README` (convention), a silent default pack manifest.
- **Deps:** M1, M2 (theme-scoped packs).
- **Risks:** eager `AudioContext` creation before a user gesture — mitigated by lazy init
  on first `play()`.
- **Acceptance:** `play(category,name)` is a no-op-safe API (silent default), respects
  `soundsEnabled` + perf tier; no bundled audio.

### M8 — Accessibility foundation ☐
- **Files (edit/new):** global `@media (prefers-reduced-motion: reduce)` + `.reduce-motion`
  formalization (`theme/motion.css`/`styles.css`), focus-visible ring tokens (M1),
  ARIA/keyboard in `ui/*`, large-text support, formalize the `high-contrast` theme.
- **Deps:** M1, M4, M5.
- **Risks:** contrast failures in the Aero palette — mitigated by a documented contrast
  check in the audit.
- **Acceptance:** keyboard nav + visible focus everywhere in `ui/*`; reduced-motion
  honoured globally; high-contrast theme passes contrast.

### M9 — Performance architecture ☐
- **Files (edit/new):** `data-perf` attribute driver (extend `osPersonalization.ts` /
  `displayPrefs.ts`), perf-aware blur/animation utilities (`theme/motion.css`,
  `materials.css`).
- **Deps:** M3, M4, M8.
- **Risks:** perf tiers not actually degrading heavy utilities — mitigated by routing all
  blur/animation through tokens that the tier overrides.
- **Acceptance:** switching tier changes `data-perf`; Battery/Performance visibly reduces
  blur + animation; Maximum Atmosphere restores them.

### M10 — Anime-Edition & future-compat hooks ☐
- **Files (edit):** theme engine (`assetPack`/`materialSet` resolution), docs.
- **Deps:** M2, M3, M6, M7.
- **Risks:** over-building toward Anime — mitigated by shipping only extension points +
  interfaces, no assets/behaviour.
- **Acceptance:** a theme can declare an asset/sound/wallpaper pack; swapping a pack
  changes assets only, never layout/components/motion/behaviour.

### M11 — Docs + verification audit ☐
- **Files (new):** `THEME_ENGINE.md`, `DESIGN_SYSTEM.md`, `COMPONENT_LIBRARY.md`,
  `MOTION_GUIDELINES.md`, `THEME_TOKEN_REFERENCE.md`, `ACCESSIBILITY.md`, `PERFORMANCE.md`.
- **Deps:** M1–M10.
- **Audit checklist:** no NEW hardcoded colors in Phase 1 code · primitives inherit
  tokens · theme switching works (incl. hidden Aero) · a11y (keyboard/focus/reduced-motion)
  · perf tiers degrade · a new theme registers without touching components.
- **Acceptance:** all docs present; audit passes; issues found are fixed.

---

## Status log

- **M0** — baseline `eafa4ac`; branch `feat/frutiger-aero-platform`; this plan authored. ◐→ (commit closes M0)
