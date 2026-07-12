# Theme Token Reference

Two token layers, both consumed as CSS custom properties and mirrored (for the
platform tier) in `src/renderer/theme/tokens.ts` (`TOKEN_GROUPS`).

- **Base tokens** — pre-existing, declared in `styles.css :root`, overridden by
  the 13 themes + the runtime personalization engine. The platform builds on these.
- **Platform tokens** — added by `theme/tokens.css` (M1) + status colours (M11).
  Additive; no base token is redefined.

Reference tokens with `var(--name)`. In TS/TSX, use the typed helpers in
`tokens.ts` (`cssVar`, `fontSize`, `duration`, `easing`, `blur`, `elevation`,
`zIndex`).

---

## Base tokens (pre-existing, `styles.css`)

| Group | Tokens |
|---|---|
| Colour | `--bg --panel --panel-2 --sidebar --text --muted --border --accent --accent-2 --red --red-deep --grid-line --chrome --chrome-elevated` |
| Spacing | `--space-xs --space-sm --space-md --space-lg --space-xl` (4/8/12/16/24) |
| Radius | `--radius-sm --radius-md --radius-lg` (6/8/12) |
| Type | `--font-body --font-mono` |
| Elevation | `--shadow-card --shadow-toolbar` |
| Controls | `--control-bg --control-border --control-radius --control-pad --control-font` |
| Layout | `--wallpaper-dim --taskbar-h --start-cols --desk-icon-w --desk-icon-h --motion-duration` |
| Scrollbars | `--scrollbar-size --scrollbar-track --scrollbar-thumb …` |

These are overridden per theme (`:root[data-theme='…']`) and at runtime by
`osPersonalization.ts` / `displayPrefs.ts` (accent, density, radius, shadow, font).

---

## Platform tokens (`theme/tokens.css`)

### Typography · size (rem-based; `--font-size-md` = 14px body)
`--font-size-2xs` 11 · `-xs` 12 · `-sm` 13 · `-md` 14 · `-lg` 16 · `-xl` 18 ·
`-2xl` 22 · `-3xl` 28 · `-4xl` 36 · `-hero` 48 · `-display` 64

### Typography · rhythm
`--line-height-tight|snug|normal|relaxed` (1.15/1.3/1.5/1.7) ·
`--font-weight-regular|medium|semibold|bold` (400/500/600/700) ·
`--letter-spacing-tight|normal|wide|wider` · `--font-display` (defaults to body)

### Spacing extensions
`--space-2xs` 2 · `--space-2xl` 32 · `--space-3xl` 48 · `--space-4xl` 64

### Radius extensions
`--radius-xs` 4 · `--radius-xl` 16 · `--radius-2xl` 22 · `--radius-pill` 999

### Motion · duration
`--dur-instant` 80ms · `-fast` 140 · `-normal` 240 · `-slow` 380 · `-xslow` 640

### Motion · easing
`--ease-standard --ease-emphasized --ease-decelerate --ease-accelerate`
`--ease-spring` (gentle overshoot) `--ease-glass` (smooth glass reveal)

### Blur
`--blur-sm` 6 · `-md` 12 · `-lg` 20 · `-xl` 32 · `-max` 48

### Elevation
`--shadow-color-weak|·|-strong` (tokenised shadow colour) →
`--elevation-0…5` ramp built from them.

### Z-index
`--z-base --z-raised --z-dropdown --z-sticky --z-window --z-overlay --z-modal --z-popover --z-toast --z-tooltip --z-max`

### Interaction alphas
`--alpha-hover` .08 · `-pressed` .16 · `-selected` .22 · `-disabled` .45 · `-muted` .6

### Surface / glass / reflection
`--sheen --sheen-strong --glass-tint --glass-tint-strong --glass-border`
`--glass-highlight --glass-blur` — overridden bright under Aero.

### Focus ring
`--focus-ring-color --focus-ring-width --focus-ring-offset`

### Status colours (M11; themeable)
`--status-success` `--status-warning` `--status-error` (= `--red`) `--status-info` (= `--accent`)

### Colour helpers (`typography.css`)
`--accent-weak` `--accent-soft` `--accent-strong` `--accent-on` — accent shades
derived from the active theme's `--accent`.

### Material faces (`materials.css`)
`--mat-metal-top|-mid|-bot` `--mat-plastic-face|-top` — silver/plastic surfaces,
overridden per theme.

---

## Theme-specific overrides

Each theme overrides a subset of the colour + glass tokens. The Frutiger Aero
theme (`frutiger-aero.css`) additionally overrides the glass/sheen tokens (bright
white glass), the metal faces (silver), scrollbars, and `--font-display`. The
high-contrast theme (`a11y.css`) forces opaque glass + text-colour borders.
