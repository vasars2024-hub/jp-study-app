# Motion Guidelines

Source: `src/renderer/theme/motion.css` + the motion tokens in `tokens.css`.
**Philosophy: soft, fluid, confident — never abrupt.**

## Tokens

**Durations:** `--dur-instant` 80ms · `--dur-fast` 140 · `--dur-normal` 240 ·
`--dur-slow` 380 · `--dur-xslow` 640.

**Easings:** `--ease-standard` (general) · `--ease-emphasized` · `--ease-decelerate`
(enter) · `--ease-accelerate` (exit) · `--ease-spring` (gentle overshoot) ·
`--ease-glass` (smooth glass reveal — the signature Aero curve).

Never write literal durations/curves; always use these tokens.

## Enter animations (utilities)
`.anim-fade` · `.anim-scale-in` · `.anim-slide-up|down|left|right` ·
`.anim-glass-reveal` (opacity + scale + de-blur).

## Semantic (named app moments → a curve/duration)
`.anim-dialog` · `.anim-window` · `.anim-sidebar` · `.anim-notification`
(spring) · `.anim-tree-expand` / `.anim-accordion`.

## Loading
`.anim-spin` · `.anim-pulse` · `.anim-shimmer` (skeletons).

## Transitions (for hover/selection/toggle states)
`.trans-fast` · `.trans-normal` · `.trans-slow` · `.trans-colors` ·
`.trans-toggle` (spring transform).

## Usage

```tsx
<div className="ui-glass-card anim-glass-reveal">…</div>
<button className="ui-btn trans-fast">…</button>
```

Choose by intent: enter = decelerate; exit = accelerate; playful = spring; glass
surfaces = `--ease-glass`. Keep most transitions at `--dur-fast`/`--dur-normal`;
reserve `--dur-slow`/`-xslow` for windows/dialogs/glass reveals.

## Reduced motion (always honoured)

Motion collapses automatically under **any** of:
- OS `prefers-reduced-motion: reduce` (global, `a11y.css`),
- the in-app `html.reduce-motion` toggle,
- the legacy `html[data-display-anim='none']` convention,
- Battery Saver (`data-perf='battery'`).

Durations drop to ~0 (so `animationend`/`transitionend` still fire and dependent
logic keeps working) but nothing visibly moves. You get this for free by using
the `.anim-*`/`.trans-*` utilities — do not hand-roll animations that ignore it.
