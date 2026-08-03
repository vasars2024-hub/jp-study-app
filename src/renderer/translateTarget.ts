/**
 * The one owner of `jp-study-translate-target` — the language the user wants text
 * translated *into*, shared by the Translate view, both readers, the sentence popup
 * and the reader collection panel.
 *
 * It previously had five owners. Each declared its own constant and normalised
 * differently: the two readers lower-cased and trimmed on read and write, the popup
 * and the Translate view took the raw string with an `'en'` fallback, and the
 * collection panel took it raw with no fallback at all. A value written by one was
 * therefore not necessarily the value another read back — `architecture-audit.cjs`
 * flags exactly this as `duplicate-storage`.
 *
 * Normalising on write as well as on read means a store written by an older build
 * heals the first time anything sets it.
 */

export const TRANSLATE_TARGET_KEY = 'jp-study-translate-target';
export const TRANSLATE_TARGET_EVENT = 'jp-study-translate-target-changed';

export const DEFAULT_TRANSLATE_TARGET = 'en';

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase() || DEFAULT_TRANSLATE_TARGET;
}

export function getTranslateTarget(): string {
  try {
    return normalize(localStorage.getItem(TRANSLATE_TARGET_KEY));
  } catch {
    // Storage can be unavailable (private mode, a locked profile). A translation
    // target is a preference, so falling back is always better than throwing.
    return DEFAULT_TRANSLATE_TARGET;
  }
}

export function setTranslateTarget(code: string): string {
  const next = normalize(code);
  try {
    localStorage.setItem(TRANSLATE_TARGET_KEY, next);
  } catch {
    /* storage unavailable */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<string>(TRANSLATE_TARGET_EVENT, { detail: next }));
  }
  return next;
}

export function onTranslateTargetChanged(listener: (code: string) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handle = (event: Event) => listener((event as CustomEvent<string>).detail);
  window.addEventListener(TRANSLATE_TARGET_EVENT, handle);
  return () => window.removeEventListener(TRANSLATE_TARGET_EVENT, handle);
}
