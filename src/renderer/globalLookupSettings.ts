// Trigger settings for the OS-wide dictionary lookup (GlobalDictionaryOverlay).
//
// The six reader views (Novel, Book, Manga, Immersion, Music, Media) open the
// dictionary popup on a plain click of their own accord. This module governs the
// *other* gesture — the one that works anywhere else in the Study OS: on a note,
// a flashcard, a grammar example, a subtitle line, a settings label.
//
// Default is Shift+click: a modifier gesture can be intercepted wholesale
// (preventDefault on mousedown) without ever fighting normal clicking, so it is
// safe to arm across every surface at once. 'click' is the aggressive opt-in —
// it stays passive and skips interactive controls and reader surfaces instead.

export type GlobalLookupTrigger = 'off' | 'shift' | 'ctrl' | 'alt' | 'click';

export const GLOBAL_LOOKUP_TRIGGERS: GlobalLookupTrigger[] = ['off', 'shift', 'ctrl', 'alt', 'click'];

export interface GlobalLookupSettings {
  trigger: GlobalLookupTrigger;
  /** Also arm the gesture inside the six reader views (they already plain-click). */
  inReaders: boolean;
}

const KEY = 'jp-global-lookup-v1';
const CHANGED = 'global-lookup-changed';

const DEFAULTS: GlobalLookupSettings = {
  trigger: 'shift',
  inReaders: true,
};

export function loadGlobalLookupSettings(): GlobalLookupSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<GlobalLookupSettings>;
    const trigger = GLOBAL_LOOKUP_TRIGGERS.includes(parsed.trigger as GlobalLookupTrigger)
      ? (parsed.trigger as GlobalLookupTrigger)
      : DEFAULTS.trigger;
    return {
      trigger,
      inReaders: typeof parsed.inReaders === 'boolean' ? parsed.inReaders : DEFAULTS.inReaders,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveGlobalLookupSettings(next: Partial<GlobalLookupSettings>): GlobalLookupSettings {
  const merged = { ...loadGlobalLookupSettings(), ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    /* quota / private mode — keep the in-memory value */
  }
  window.dispatchEvent(new CustomEvent<GlobalLookupSettings>(CHANGED, { detail: merged }));
  return merged;
}

/** Subscribe to trigger changes (settings UI and the toggle shortcut both write). */
export function onGlobalLookupChanged(cb: (s: GlobalLookupSettings) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent<GlobalLookupSettings>).detail);
  window.addEventListener(CHANGED, h);
  return () => window.removeEventListener(CHANGED, h);
}

/**
 * Flip the gesture on/off, remembering which modifier was in use so the toggle
 * shortcut restores the user's choice rather than snapping back to the default.
 */
export function toggleGlobalLookup(): GlobalLookupSettings {
  const cur = loadGlobalLookupSettings();
  if (cur.trigger === 'off') {
    const remembered = localStorage.getItem(`${KEY}-last`) as GlobalLookupTrigger | null;
    const restore =
      remembered && remembered !== 'off' && GLOBAL_LOOKUP_TRIGGERS.includes(remembered)
        ? remembered
        : DEFAULTS.trigger;
    return saveGlobalLookupSettings({ trigger: restore });
  }
  try {
    localStorage.setItem(`${KEY}-last`, cur.trigger);
  } catch {
    /* ignore */
  }
  return saveGlobalLookupSettings({ trigger: 'off' });
}

/** True when this mouse event carries exactly the configured modifier. */
export function matchesTrigger(
  e: { shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean; button?: number },
  trigger: GlobalLookupTrigger,
): boolean {
  if (trigger === 'off') return false;
  if (e.button !== undefined && e.button !== 0) return false;
  switch (trigger) {
    // Exact-match the modifier so Ctrl+Shift+click (a range-select in lists) and
    // other compound gestures keep their existing meaning.
    case 'shift':
      return e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey;
    case 'ctrl':
      return e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey;
    case 'alt':
      return e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey;
    case 'click':
      return !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey;
    default:
      return false;
  }
}

/** Modifier modes can safely swallow the click; plain-click mode must not. */
export function isModifierTrigger(trigger: GlobalLookupTrigger): boolean {
  return trigger === 'shift' || trigger === 'ctrl' || trigger === 'alt';
}
