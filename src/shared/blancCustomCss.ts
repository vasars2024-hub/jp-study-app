// Blanc custom-CSS escape hatch (Pillar 4).
//
// The theme editor (blancTheme.ts) is the *safe* surface — colours only, matched
// against an allowlist grammar. This is the *sharp* surface: a raw CSS textarea.
// The plan's constraint is explicit — user CSS "must not be able to hide the
// settings entry point or the way out of Blanc, or the user can lock themselves
// out." Raw CSS cannot be grammar-validated the way a colour can, so the safety
// model here is different, and it rests on two facts about the Blanc shell:
//
//  1. The *persistent* state is this string. The taskbar-hidden and
//     workspace-full states are ephemeral React state (`useState(false)`) that
//     reset on reload — so they are not lockout vectors: a reload restores the
//     taskbar. The one thing that survives a reload is this CSS.
//
//  2. Therefore the only way to permanently lock yourself out is to hide the
//     always-visible taskbar (which holds both the Settings nav button and the
//     Exit Blanc button) via persisted custom CSS.
//
// So the guard's whole job is to make that taskbar un-hideable. It is emitted as
// a second stylesheet appended *after* the user's, re-asserting the taskbar,
// nav, nav buttons and Exit control with `!important` — which wins over any user
// rule, `!important` or not, because equal-specificity `!important` ties break by
// source order and the guard is always last. It also pins the taskbar into
// normal flow, defeating off-screen positioning. Nothing else styles those
// controls with `!important`, so the guard is never in a fight it can lose.
//
// Scoping: user CSS is wrapped in `@scope (.blanc-root) { … }` so bare selectors
// only match inside Blanc, and a stray `@import` (which must be first in a sheet)
// is nested and therefore ignored — no remote stylesheet fetch. Scoping is best
// effort for containment; the guard is the guarantee.

/** Hard cap on stored custom CSS. Generous for hand-written themes, bounded so a
 *  pathological paste cannot bloat settings storage or the injected stylesheet. */
export const MAX_CUSTOM_CSS_LENGTH = 20000;

/** The style element ids used by the renderer applier. Exported so the applier
 *  and any test agree on one source of truth. */
export const BLANC_CUSTOM_CSS_STYLE_ID = 'blanc-custom-css';
export const BLANC_CUSTOM_CSS_GUARD_STYLE_ID = 'blanc-custom-css-guard';

/** Coerce to a bounded string. Content is deliberately not stripped or rewritten
 *  — the guard, not sanitisation, is what makes unsafe CSS safe. */
export function sanitizeCustomCss(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.length > MAX_CUSTOM_CSS_LENGTH ? value.slice(0, MAX_CUSTOM_CSS_LENGTH) : value;
}

/**
 * The lockout guard.
 *
 * Re-asserts the Exit-Blanc button and the Settings entry point (a nav button)
 * against any custom rule. Split by control so each gets a `display` value that
 * matches blanc.css rather than a one-size value that would distort layout:
 * the taskbar and nav are flex columns, a nav button is a flex row, the Exit
 * button is a block. The session-only escape controls (`taskbar-reveal`,
 * `fullscreen-exit`) are surfaced too, as belt-and-suspenders for the ephemeral
 * hidden states.
 */
export const BLANC_LOCKOUT_GUARD_CSS = `/* Blanc lockout guard — keeps the way out of Blanc reachable. */
.blanc-root:not(.is-workspace-full):not(.is-taskbar-hidden) .blanc-taskbar {
  display: flex !important;
  visibility: visible !important;
  opacity: 1 !important;
  pointer-events: auto !important;
  position: static !important;
  left: auto !important;
  right: auto !important;
  top: auto !important;
  bottom: auto !important;
  transform: none !important;
  clip-path: none !important;
  width: 150px !important;
  min-width: 150px !important;
  max-width: none !important;
  height: auto !important;
  max-height: none !important;
  overflow: visible !important;
}
.blanc-root .blanc-nav {
  display: flex !important;
  visibility: visible !important;
  opacity: 1 !important;
  pointer-events: auto !important;
}
.blanc-root .blanc-nav-btn {
  display: flex !important;
  visibility: visible !important;
  opacity: 1 !important;
  pointer-events: auto !important;
  min-height: 28px !important;
  height: auto !important;
  max-height: none !important;
  transform: none !important;
  clip-path: none !important;
  overflow: visible !important;
}
.blanc-root .blanc-exit {
  display: block !important;
  visibility: visible !important;
  opacity: 1 !important;
  pointer-events: auto !important;
  min-height: 28px !important;
  height: auto !important;
  max-height: none !important;
  transform: none !important;
  clip-path: none !important;
  overflow: visible !important;
}
.blanc-root .blanc-taskbar-reveal,
.blanc-root .blanc-fullscreen-exit {
  display: flex !important;
  visibility: visible !important;
  opacity: 1 !important;
  pointer-events: auto !important;
  z-index: 2147483646 !important;
}`;

/** Wrap user CSS so bare selectors only match inside `.blanc-root`. Empty in,
 *  empty out — so "no custom CSS" is indistinguishable from never having set it. */
export function scopeCustomCss(css: string): string {
  const body = sanitizeCustomCss(css).trim();
  if (!body) return '';
  return `@scope (.blanc-root) {\n${body}\n}`;
}

export interface BlancCustomCssPayload {
  /** The scoped user stylesheet (may be empty). */
  user: string;
  /** The lockout guard, emitted only when there is user CSS to guard against. */
  guard: string;
}

/**
 * Resolve stored custom CSS into the two stylesheets the applier injects, in
 * order: `user` first, then `guard`. When there is no custom CSS, both are empty
 * and the applier removes any existing style elements.
 */
export function buildBlancCustomCss(css: unknown): BlancCustomCssPayload {
  const user = scopeCustomCss(sanitizeCustomCss(css));
  return { user, guard: user ? BLANC_LOCKOUT_GUARD_CSS : '' };
}
