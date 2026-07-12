/**
 * User CSS sandbox — Advanced personalization.
 * Injected as a single <style id="jp-user-css">; disabled on parse/guard failure.
 * Escape hatch: clearCustomCss() / reset look.
 */

const KEY = 'jp-os-custom-css-v1';
const STYLE_ID = 'jp-user-css';
const MAX_LEN = 24_000;
const EVENT = 'jp-os-custom-css-changed';

/** Strip obvious foot-guns; this is not a full CSS sanitizer. */
export function sanitizeUserCss(raw: string): { ok: true; css: string } | { ok: false; error: string } {
  if (typeof raw !== 'string') return { ok: false, error: 'Invalid CSS.' };
  if (raw.length > MAX_LEN) return { ok: false, error: `CSS too long (max ${MAX_LEN} characters).` };
  const lower = raw.toLowerCase();
  const banned = [
    '@import',
    'javascript:',
    'expression(',
    '-moz-binding',
    'behavior:',
    'vbscript:',
    '</style',
    '<script',
  ];
  for (const b of banned) {
    if (lower.includes(b)) return { ok: false, error: `Blocked construct: ${b}` };
  }
  return { ok: true, css: raw };
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
