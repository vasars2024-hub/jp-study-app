/**
 * The one owner of `jp-study-translate-source` — the language the user is
 * translating *from*.
 *
 * Deliberately the mirror of `translateTarget.ts`, down to the normalisation and
 * the change event, because the pair is read and written together everywhere and
 * two halves that behave differently is how the target key acquired five owners
 * in the first place (see that module's header, and
 * `PHASE_21_ARCHITECTURE_AUDIT_STATE.md:103`).
 *
 * Until now this key had no owner at all: `TranslateContent.tsx` declared
 * `SOURCE_KEY` locally and hit `localStorage` raw, with no normalisation on
 * either side and no event — so a value written anywhere else was invisible to a
 * mounted Translate view until it remounted. Aero v1.0 audit item 5.4 needed a
 * second writer (Settings), which is exactly the point at which "raw
 * localStorage in a shared module" stops being survivable.
 *
 * The fallback is deliberately NOT a constant here. `getStudyLang()` is the
 * user's own study language and is the better default for a *source* language,
 * but it lives in `studyEnvironment` and importing it would make this module
 * depend on study state to answer a storage question. So the caller passes its
 * own fallback, and `TranslateContent` keeps passing `getStudyLang()`.
 */

export const TRANSLATE_SOURCE_KEY = 'jp-study-translate-source';
export const TRANSLATE_SOURCE_EVENT = 'jp-study-translate-source-changed';

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/** Returns `fallback` when nothing is stored, or when storage is unavailable. */
export function getTranslateSource(fallback: string): string {
  try {
    return normalize(localStorage.getItem(TRANSLATE_SOURCE_KEY)) || fallback;
  } catch {
    // Storage can be unavailable (private mode, a locked profile). A source
    // language is a preference, so falling back is always better than throwing.
    return fallback;
  }
}

export function setTranslateSource(code: string): string {
  const next = normalize(code);
  try {
    localStorage.setItem(TRANSLATE_SOURCE_KEY, next);
  } catch {
    /* storage unavailable */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<string>(TRANSLATE_SOURCE_EVENT, { detail: next }));
  }
  return next;
}

export function onTranslateSourceChanged(listener: (code: string) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handle = (event: Event) => listener((event as CustomEvent<string>).detail);
  window.addEventListener(TRANSLATE_SOURCE_EVENT, handle);
  return () => window.removeEventListener(TRANSLATE_SOURCE_EVENT, handle);
}
