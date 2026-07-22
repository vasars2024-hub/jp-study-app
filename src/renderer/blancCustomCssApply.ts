// Applies the Blanc custom-CSS escape hatch to the document (Pillar 4).
//
// Two <style> elements, always in this order: the user's scoped stylesheet, then
// the lockout guard. Order is the whole point — the guard must be the last
// author stylesheet so its `!important` rules win the source-order tiebreak over
// anything the user wrote. See shared/blancCustomCss.ts for the safety argument.

import {
  buildBlancCustomCss,
  BLANC_CUSTOM_CSS_STYLE_ID,
  BLANC_CUSTOM_CSS_GUARD_STYLE_ID,
} from '../shared/blancCustomCss';

function upsertStyle(id: string, css: string): HTMLStyleElement | null {
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!css) {
    el?.remove();
    return null;
  }
  if (!el) {
    el = document.createElement('style');
    el.id = id;
    document.head.appendChild(el);
  }
  if (el.textContent !== css) el.textContent = css;
  return el;
}

/** Write (or clear) the custom-CSS and guard style elements. Idempotent. */
export function applyBlancCustomCss(css: unknown): void {
  if (typeof document === 'undefined') return;
  const { user, guard } = buildBlancCustomCss(css);

  // User sheet first. Setting textContent (not innerHTML) means a stray
  // `</style>` in the user's CSS is inert text, not a tag — no markup injection.
  upsertStyle(BLANC_CUSTOM_CSS_STYLE_ID, user);

  // Guard last: create/refresh it, then move it to the end of <head> so it wins
  // the source-order tiebreak even if another stylesheet (e.g. the theme
  // overrides) was appended after the user sheet.
  const guardEl = upsertStyle(BLANC_CUSTOM_CSS_GUARD_STYLE_ID, guard);
  if (guardEl && guardEl !== document.head.lastElementChild) {
    document.head.appendChild(guardEl);
  }
}
