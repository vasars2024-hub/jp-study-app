# Frutiger Aero Platform — Design System

Phase 1 built a reusable Frutiger Aero **platform** inside the Study OS: a theme
engine, design tokens, materials, typography/colour/motion systems, an accessible
component library, and wallpaper/audio frameworks — the infrastructure every
future Frutiger Aero feature builds on. This is the hub doc; see the linked
references for detail.

- [THEME_ENGINE.md](THEME_ENGINE.md) — themes, registry, hidden Aero theme, asset packs, versioning
- [THEME_TOKEN_REFERENCE.md](THEME_TOKEN_REFERENCE.md) — every design token
- [COMPONENT_LIBRARY.md](COMPONENT_LIBRARY.md) — the `ui/*` primitives
- [MOTION_GUIDELINES.md](MOTION_GUIDELINES.md) — durations, easings, animation utilities
- [ACCESSIBILITY.md](ACCESSIBILITY.md) — focus, reduced motion, contrast, large text
- [PERFORMANCE.md](PERFORMANCE.md) — the `data-perf` tiers
- [VERIFICATION.md](VERIFICATION.md) — the Phase 1 audit results

## Core principle

**Everything visual comes from a token or a material class.** Component and
material code never hardcodes a colour; the one place literal colours live is a
**theme** (e.g. `frutiger-aero.css`), which maps a palette onto the semantic
tokens. Switch the theme → the whole platform restyles instantly, with no
per-component work.

## Architecture (layers, in cascade order)

The platform is **additive**: it layers over the existing app (`styles.css`, the
13 legacy themes, the `os-*`/`fwin-*` classes) without modifying it. Import order
in `main.tsx`:

1. `theme/tokens.css` — the token tiers (loaded **before** `styles.css` so the
   existing `:root` stays authoritative on any shared name).
2. `styles.css` — the pre-existing app styles + base semantic tokens (`--bg`,
   `--panel`, `--accent`, `--space-*`, `--radius-*`, …). **Unchanged.**
3. `theme/materials.css` — glass/gloss/chrome/… surface utilities.
4. `theme/frutiger-aero.css` — the secret Aero theme palette.
5. `theme/typography.css`, `theme/motion.css` — type roles + motion utilities.
6. `components/ui/ui.css` — the primitive component styles.
7. `theme/a11y.css` — accessibility reinforcement (loaded late).
8. `theme/perf.css` — performance-tier degradation.

TypeScript modules: `theme/engine.ts` (registry) with `theme.ts` as a back-compat
facade; `theme/ThemeContext.tsx` (React); `theme/perf.ts`, `theme/assetPacks.ts`;
`environment/wallpaperFramework.ts`; `audio/soundEngine.ts` + `soundPack.ts`.

## How to use it (new code)

```tsx
import { Button, GlassCard, Dialog, Toggle } from '../components/ui';

<GlassCard>
  <h2 className="type-section">Settings</h2>
  <Toggle label="Reduce motion" checked={x} onChange={…} />
  <Button variant="primary">Save</Button>
</GlassCard>
```

- **Surfaces:** wrap content in a material (`.mat-glass`, `.mat-panel`, …) or a
  surface primitive (`GlassCard`, `Card`, `Panel`).
- **Text:** apply a type role (`.type-body`, `.type-heading`, …).
- **Spacing/radius/colour:** reference tokens (`var(--space-md)`, `var(--accent)`).
- **Motion:** add a motion utility (`.anim-fade`, `.trans-normal`) — never a raw
  `@keyframes`/`transition` with literal timings.

## Rules

1. No hardcoded colours in component/material code — use tokens. (Achromatic
   `#fff`/`#000` as `color-mix` endpoints or white-on-accent text is the only
   accepted exception; see VERIFICATION.md.)
2. No hardcoded spacing/radius/duration — use tokens.
3. A new theme is a `:root[data-theme='id']` block that overrides tokens, plus a
   `registerTheme(...)` call. Never restyle components per theme.
4. New windows/dialogs/menus use the `ui/*` primitives; existing feature
   components are migrated opportunistically, never in a big-bang rewrite.
5. Every interactive element is keyboard-reachable and shows a focus ring
   (inherited automatically from `ui.css` / `a11y.css`).
