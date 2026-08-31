/**
 * Liquid Workplace — L9. The one honest route from a widget to an application
 * surface.
 *
 * `os:open` is the Study OS desktop bus, and `MiniShell` mirrors it precisely
 * because a routine that dispatched into nothing "would read as a dead button"
 * (its own comment, `MiniShell.tsx:246`). Three further hosts render the very
 * same widgets and own no listener at all: a first-class pop-out
 * (`App.tsx` `?popout=…`), the full-screen reader, and Blanc — whose panels
 * dispatch `os:open` while `BlancStudyPanels.tsx:698` records that the bus does
 * not move Blanc's shell. So a control that only dispatched the event was dead
 * in exactly the windows a widget most often lives in. `openAgentSurface`
 * (`agentContextHandoff.ts:198`) already documents this for one surface; this
 * module is that reasoning generalised, so the next widget does not have to
 * rediscover it.
 *
 * DECISION: the event is dispatched `cancelable` and the shells that own it
 * call `markSectionOpenHandled`. `dispatchEvent` returns `false` when something
 * did, which is the DOM's own answer to "did a host take this" — a side
 * registry of "which shell is mounted" would be a second source of truth that
 * can drift away from the listeners it describes. Dispatchers that do not care
 * keep sending a plain non-cancelable event; `preventDefault` on one of those
 * is a no-op, so no existing caller changes behaviour.
 *
 * The fallback is main's pop-out route rather than an error: it is reachable
 * from every renderer and deduplicates by section, so asking twice focuses the
 * window that already exists.
 */

export const SECTION_OPEN_EVENT = 'os:open';

interface PopOutCapableWindow {
  api?: { popOut?: (section: string) => Promise<void> };
}

/**
 * Called by a shell that owns `os:open`, at the point it actually acts on the
 * event — never at the top of the handler. A handler that returns without
 * opening anything must leave the event un-cancelled, or the caller's fallback
 * is suppressed by a host that did nothing.
 */
export function markSectionOpenHandled(ev: Event): void {
  if (ev.cancelable) ev.preventDefault();
}

/**
 * Open an application section from any host. Returns whether an in-window
 * shell claimed it, so a caller that wants to know can tell the two routes
 * apart; both are real, neither is a failure.
 */
export function openSectionSurface(section: string): boolean {
  if (typeof window === 'undefined' || !section) return false;
  const claimed = !window.dispatchEvent(
    new CustomEvent(SECTION_OPEN_EVENT, { detail: section, cancelable: true }),
  );
  if (claimed) return true;
  const api = (window as PopOutCapableWindow).api;
  if (typeof api?.popOut !== 'function') return false;
  void api.popOut(section).catch(() => undefined);
  return false;
}
