/**
 * One-shot handoffs between views.
 *
 * Several places need to say "open X next" to a view that is not mounted yet — the
 * playlist manager handing a media id to the media view, a study action handing a
 * request to study mode, the novels list handing a book to the flashcards miner. Each
 * had grown its own key constant, declared once in the writer and again in the reader
 * and kept in sync by hand; `tools/architecture-audit.cjs` flags that as
 * `duplicate-storage`.
 *
 * **The storage is per key, not global.** The mining handoffs survive a reload on
 * purpose (`localStorage`) because the target view can be several navigations away;
 * the media ones are deliberately `sessionStorage`, so a handoff cannot outlive the
 * window and re-open something the user asked for days ago. Both behaviours were
 * already in the call sites — this module preserves them rather than picking one.
 *
 * `take` reads and clears in a single step, so a view that mounts twice cannot act on
 * one handoff twice.
 */

type Backing = 'local' | 'session';

const HANDOFFS = {
  epubMining: { key: 'jp-pending-epub-mining', backing: 'local' },
  jitenMining: { key: 'jp-pending-jiten-mining', backing: 'local' },
  mediaId: { key: 'jp-pending-media-id', backing: 'session' },
  studyContextRef: { key: 'jp-pending-study-context-ref', backing: 'session' },
  studyMediaId: { key: 'jp-pending-study-media-id', backing: 'session' },
  studyMediaRequest: { key: 'jp-pending-study-media-request', backing: 'session' },
  libraryFocusFolder: { key: 'jp-library-focus-folder', backing: 'session' },
  /*
   * "Practice this" deep links into Grammar.
   *
   * `session`, not `local`: a deep link expresses what the user wants *now*,
   * and one that survived a restart would open Practice with filters they set
   * days ago.
   *
   * This exists because the dispatchers used to do `os:open` → fixed
   * `setTimeout(…, 80)` → `dispatchEvent`, while the listener is registered by
   * `GrammarView`'s effect inside a `lazy()` chunk behind `Suspense`. A
   * `CustomEvent` is not queued, so on a cold chunk the link was delivered to
   * nobody — measured at 93 ms dispatch against a 691 ms mount, 598 ms before
   * its listener existed, leaving the app on Grammar points with nothing said.
   * A warm run passed, so the failure was exactly first-use-in-a-session.
   * Audit F22. Raising the timeout re-tunes the race; the handoff removes it.
   */
  grammarPractice: { key: 'jp-pending-grammar-practice', backing: 'session' },
} as const satisfies Record<string, { key: string; backing: Backing }>;

export type PendingHandoff = keyof typeof HANDOFFS;

export const PENDING_HANDOFF_KEYS: Record<PendingHandoff, string> = Object.fromEntries(
  Object.entries(HANDOFFS).map(([name, spec]) => [name, spec.key]),
) as Record<PendingHandoff, string>;

function store(name: PendingHandoff): Storage {
  return HANDOFFS[name].backing === 'local' ? localStorage : sessionStorage;
}

export function setHandoff(name: PendingHandoff, value: string): void {
  try {
    store(name).setItem(HANDOFFS[name].key, value);
  } catch {
    // Storage can be unavailable. A handoff is a convenience, never a correctness
    // requirement — the user can still open the target by hand.
  }
}

export function setHandoffJson(name: PendingHandoff, value: unknown): void {
  setHandoff(name, JSON.stringify(value));
}

/** Reads and clears in one step, so a handoff can never be acted on twice. */
export function takeHandoff(name: PendingHandoff): string | null {
  try {
    const target = store(name);
    const value = target.getItem(HANDOFFS[name].key);
    if (value !== null) target.removeItem(HANDOFFS[name].key);
    return value;
  } catch {
    return null;
  }
}

export function takeHandoffJson<T>(name: PendingHandoff): T | null {
  const raw = takeHandoff(name);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Malformed payload: it is already cleared, so the bad value cannot stick around
    // and fail again on the next mount.
    return null;
  }
}

/** Peek without consuming — only for a render that clears the handoff itself later. */
export function peekHandoff(name: PendingHandoff): string | null {
  try {
    return store(name).getItem(HANDOFFS[name].key);
  } catch {
    return null;
  }
}

export function clearHandoff(...names: PendingHandoff[]): void {
  for (const name of names) {
    try {
      store(name).removeItem(HANDOFFS[name].key);
    } catch {
      /* storage unavailable */
    }
  }
}
