# Accessibility

Source: `src/renderer/theme/a11y.css` (loaded late so it reinforces), the focus
tokens in `tokens.css`, and ARIA/keyboard built into every `ui/*` primitive.

## Focus
- **Every** focusable element shows a ring: a global `:focus-visible` fallback
  guarantees it even on elements that don't style focus; `ui/*` primitives add
  their own higher-specificity ring. Ring = `--focus-ring-color` /
  `--focus-ring-width` / `--focus-ring-offset`.
- Keyboard patterns in primitives: Tabs/TreeView roving arrow keys; Dialog focus
  trap + Escape + focus restore; ContextMenu arrow-nav + Escape + click-outside;
  IconButton requires an accessible `label`.

## Reduced motion
Honoured app-wide (OS `prefers-reduced-motion`, the in-app `.reduce-motion`
toggle, legacy `data-display-anim='none'`, and Battery Saver). Durations collapse
to ~0 without breaking end-event logic. See [MOTION_GUIDELINES.md](MOTION_GUIDELINES.md).

## High contrast
The `high-contrast` theme is formalised: glass/translucency/blur are forced off
(they wreck contrast), surfaces become opaque, borders use the text colour, and
the focus ring thickens (3px, text-coloured). Applies to all materials + `ui/*`
overlays. The OS `prefers-contrast: more` hint also strengthens borders/focus.

## Large text
`html[data-text-size='large']` (112.5%) and `'xlarge'` (125%) scale the rem-based
type scale uniformly. Independent of — and combinable with — the app zoom
(`appZoom.ts`, which scales the whole UI). A settings toggle sets the attribute.

## Screen readers
- `.sr-only` — visually hidden, still announced. `.sr-only-focusable` reveals on
  focus (skip links).
- Primitives use correct roles/ARIA: `role="dialog"`+`aria-modal`, `role="switch"`,
  `role="tablist"`/`tab`+`aria-selected`, `role="tree"`/`treeitem`+`aria-expanded`,
  `role="progressbar"`+`aria-value*`, `aria-current`, `aria-haspopup`, live regions
  on toasts/notifications.

## Colour contrast
Base + Aero text/background pairs target WCAG AA for body text (e.g. Aero
`--text #123a52` on `--panel #eaf6ff`). When adding a theme, check text-on-panel
and text-on-accent pairs hit AA; if a palette can't, prefer the high-contrast
theme for those users rather than weakening the design.

## Checklist for new UI
1. Reachable and operable by keyboard alone.
2. Visible focus ring (inherited — don't remove it).
3. Correct role/label/ARIA state.
4. No colour-only signalling (pair with icon/text).
5. Motion via `.anim-*`/`.trans-*` so reduced-motion applies.
