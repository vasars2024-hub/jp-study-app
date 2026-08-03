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

export function applyCustomCss(css: string): { ok: boolean; error?: string } {
  const check = sanitizeUserCss(css);
  if (!check.ok) {
    removeStyleNode();
    return { ok: false, error: check.error };
  }
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!check.css.trim()) {
    removeStyleNode();
    return { ok: true };
  }
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    el.setAttribute('data-source', 'user-sandbox');
    document.documentElement.appendChild(el);
  }
  el.textContent = check.css;
  return { ok: true };
}

function removeStyleNode(): void {
  document.getElementById(STYLE_ID)?.remove();
}

export function saveCustomCss(css: string): { ok: boolean; error?: string } {
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
