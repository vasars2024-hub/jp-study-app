/**
 * User CSS sandbox — Advanced personalization.
 * Injected as a single <style id="jp-user-css">; disabled on parse/guard failure.
 * Escape hatch: clearCustomCss() / reset look.
 *
 * The rules live in `shared/uiCustomization.ts` (`reviewCustomCss`), which MASTER_PLAN
 * §20's theme system also uses. Two sanitizers guarding the same document would drift,
 * and the weaker one would be the one that mattered — so this is the single rule set.
 * Routing through it is also what gives this sandbox a **lockout guard**: it previously
 * accepted `.os-taskbar { display: none }`, which leaves a user with no way to reach
 * Settings and undo it.
 */

import { UI_CUSTOM_CSS_LIMIT, reviewCustomCss } from '../shared/uiCustomization';

const KEY = 'jp-os-custom-css-v1';
const STYLE_ID = 'jp-user-css';
const EVENT = 'jp-os-custom-css-changed';

const VIOLATION_MESSAGE: Record<string, string> = {
  'at-import': 'Blocked construct: @import',
  'remote-url': 'Blocked: this stylesheet loads something over the network.',
  'script-url': 'Blocked construct: javascript:',
  expression: 'Blocked construct: expression()',
  'hides-protected': 'Blocked: this would hide part of the app you need to undo it.',
  unbalanced: 'CSS has unbalanced braces.',
  'too-long': `CSS too long (max ${UI_CUSTOM_CSS_LIMIT} characters).`,
};

export function sanitizeUserCss(raw: string): { ok: true; css: string } | { ok: false; error: string } {
  if (typeof raw !== 'string') return { ok: false, error: 'Invalid CSS.' };
  const review = reviewCustomCss(raw);
  if (review.safe) return { ok: true, css: review.css };
  const first = review.violations[0];
  return {
    ok: false,
    error: first.kind === 'blocked-construct'
      ? `Blocked construct: ${first.detail}`
      : (VIOLATION_MESSAGE[first.kind] ?? `Blocked: ${first.detail}`),
  };
}

export function loadCustomCss(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

/** `:root` / `html`, alone or with a qualifier (`:root.dark`, `html[data-theme]`). */
const ROOT_SELECTOR_PATTERN = /^\s*(:root|html)(?![\w-])/i;

/**
 * Re-declare the sheet's root-scoped custom properties as `!important`, and report how
 * many were promoted.
 *
 * **Why any of this is needed.** `osPersonalization.applyPersonalization` writes ~44
 * design tokens — `--accent`, `--space-*`, `--radius-*`, `--shadow-*`, `--font-body`,
 * `--dur-*`, `--motion-*` — as **inline styles on `documentElement`**, and an inline
 * declaration beats every selector in an author stylesheet. So the single most natural
 * thing to type into this sandbox, `:root { --accent: #ff0000 }`, parsed cleanly, passed
 * the sanitizer, landed in the DOM — and changed nothing, with no error. That is what
 * "the Custom CSS sandbox is non-functional" turned out to mean (v1.0 audit §2.2;
 * measured live: the rule's non-variable declarations applied, `--accent` stayed
 * `#10b981`, `--radius-md` stayed `14px`, `--space-md` stayed `12px`).
 *
 * `uiCustomization.profileToCss` already reached the same conclusion for the Theme
 * Studio path and emits `!important` for exactly this reason; the raw sandbox is now
 * consistent with it rather than being the one path that silently loses.
 *
 * Done through the **CSSOM**, not a regex over the user's text: the browser has already
 * parsed the sheet, so `rule.style` gives the real declarations, custom-property values
 * containing `;` or braces cannot corrupt the rewrite, and the user's stored CSS stays
 * byte-for-byte what they typed. Grouping rules (`@media`, `@supports`, `@layer`) are
 * walked recursively.
 *
 * Only the root element is promoted. `body { --x: y }` already wins for everything it
 * contains — the inline declaration is on `<html>`, so it only decides `<html>`'s own
 * computed value — and promoting it would be an override the user never asked for.
 */
export function promoteRootVariables(rules: CSSRuleList | undefined): number {
  if (!rules) return 0;
  let promoted = 0;
  for (const rule of Array.from(rules)) {
    const styleRule = rule as CSSStyleRule;
    if (typeof styleRule.selectorText === 'string' && styleRule.style) {
      const targetsRoot = styleRule.selectorText
        .split(',')
        .some((selector) => ROOT_SELECTOR_PATTERN.test(selector));
      if (targetsRoot) {
        // Snapshot the names first — setProperty mutates the declaration being iterated.
        const names = Array.from(styleRule.style).filter((name) => name.startsWith('--'));
        for (const name of names) {
          if (styleRule.style.getPropertyPriority(name)) continue;
          styleRule.style.setProperty(name, styleRule.style.getPropertyValue(name), 'important');
          promoted += 1;
        }
      }
    }
    // A style rule is ALSO a grouping rule wherever CSS nesting is supported — in
    // Chromium `CSSStyleRule.cssRules` exists (empty) on every ordinary rule. Testing
    // for it first and treating the rule as a group therefore skipped every top-level
    // rule in the sheet: measured live 2026-08-07 as `promoted: 0` with the sheet
    // parsed, all four rules present and none carrying `!important`. So both branches
    // run, and neither excludes the other.
    const nested = (rule as CSSGroupingRule).cssRules;
    if (nested) promoted += promoteRootVariables(nested);
  }
  return promoted;
}

export function applyCustomCss(css: string): { ok: boolean; error?: string; promoted?: number } {
  const check = sanitizeUserCss(css);
  if (!check.ok) {
    removeStyleNode();
    return { ok: false, error: check.error };
  }
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!check.css.trim()) {
    removeStyleNode();
    return { ok: true, promoted: 0 };
  }
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    el.setAttribute('data-source', 'user-sandbox');
    document.documentElement.appendChild(el);
  }
  el.textContent = check.css;
  let promoted = 0;
  try {
    promoted = promoteRootVariables(el.sheet?.cssRules);
  } catch {
    // Cross-origin or not-yet-parsed sheets throw on cssRules. The stylesheet is already
    // applied at this point; losing the promotion is a degraded result, not a failure.
  }
  return { ok: true, promoted };
}

function removeStyleNode(): void {
  document.getElementById(STYLE_ID)?.remove();
}

export function saveCustomCss(css: string): { ok: boolean; error?: string; promoted?: number } {
  const check = sanitizeUserCss(css);
  if (!check.ok) return { ok: false, error: check.error };
  try {
    if (!check.css.trim()) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, check.css);
  } catch {
    return { ok: false, error: 'Could not save CSS.' };
  }
  const applied = applyCustomCss(check.css);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: check.css }));
  return applied;
}

export function clearCustomCss(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  removeStyleNode();
  window.dispatchEvent(new CustomEvent(EVENT, { detail: '' }));
}

export function bootCustomCss(): void {
  try {
    // Respect personalization sandbox toggle (default enabled when unset).
    const raw = localStorage.getItem('jp-os-personalization-v1');
    if (raw) {
      const p = JSON.parse(raw) as { customCssEnabled?: boolean };
      if (p.customCssEnabled === false) {
        removeStyleNode();
        return;
      }
    }
  } catch {
    /* apply CSS anyway */
  }
  applyCustomCss(loadCustomCss());
}

export function onCustomCssChanged(cb: (css: string) => void): () => void {
  const h = (e: Event): void => cb((e as CustomEvent<string>).detail ?? '');
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
