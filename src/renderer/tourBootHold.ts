/**
 * Holds the guided tour while an Aero or WIRED boot sequence is on screen.
 *
 * First-run setup's last step can pick a look and ask for the tour in the same
 * click. Aero and WIRED answer with their own boot overlay (several seconds of
 * full-screen sequence), and the tour starting underneath it put its bubble and
 * spotlight behind the boot screen, pointing at a desktop that was about to be
 * replaced. So setup arms this hold, and the tour waits until the boot has run.
 *
 * Read from the document, not from the lifecycle modules: both publish their
 * phase as `data-secret-lifecycle` / `data-wired-lifecycle` on <html> and as a
 * window event, and importing them here would pull their audio and theme code
 * into the boot graph of every window that mounts the tour.
 *
 * The theme switch itself is asynchronous (an on-demand import, then Aero's own
 * soft-reboot timer), so the hold also covers the short gap before the boot's
 * first phase is published. If no boot ever starts (a lock screen took the
 * entry instead, or the look was already active), the hold expires on its own.
 */

/** The lifecycle events both looks broadcast on every phase change. */
const LIFECYCLE_EVENTS = ['secret:lifecycle', 'wired:lifecycle'] as const;
/** Fired here when the hold is armed or expires. */
const HOLD_EVENT = 'tour:bootHold';
/**
 * How long an armed hold waits for the boot to start. Aero publishes its first
 * phase 240 ms after the look is applied, plus the import; WIRED almost at once.
 */
export const BOOT_START_WAIT_MS = 4000;

/** Phases that are neither "no boot" nor "booted": the tour must not draw over them. */
const UNSETTLED = new Set([
  'preboot',
  'boot',
  'welcome',
  'warning',
  'reveal',
  'safe-fallback',
  'breach',
  'sleeping',
  'waking',
  'shutting-down',
]);

let pendingUntil = 0;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;

function lifecyclePhases(): Array<string | undefined> {
  if (typeof document === 'undefined') return [];
  const data = document.documentElement.dataset;
  return [data.secretLifecycle, data.wiredLifecycle];
}

function bootOnScreen(): boolean {
  return lifecyclePhases().some((phase) => phase !== undefined && UNSETTLED.has(phase));
}

function notify(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(HOLD_EVENT));
}

function clearPending(): void {
  pendingUntil = 0;
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
}

/**
 * Setup is about to apply a look that boots: hold the tour until that boot has
 * run (or, if it never starts, for `BOOT_START_WAIT_MS`).
 */
export function holdTourForThemeBoot(): void {
  clearPending();
  pendingUntil = Date.now() + BOOT_START_WAIT_MS;
  expiryTimer = setTimeout(() => {
    clearPending();
    notify();
  }, BOOT_START_WAIT_MS);
  notify();
}

/** True while a boot sequence is on screen, or one was just requested and has not started yet. */
export function tourHeldForThemeBoot(): boolean {
  if (bootOnScreen()) {
    // The boot started: from here its own phases decide.
    if (pendingUntil) clearPending();
    return true;
  }
  return pendingUntil > Date.now();
}

/** Run `listener` whenever the answer of `tourHeldForThemeBoot` may have changed. */
export function onTourBootHoldChanged(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const events = [...LIFECYCLE_EVENTS, HOLD_EVENT];
  for (const name of events) window.addEventListener(name, listener);
  return () => {
    for (const name of events) window.removeEventListener(name, listener);
  };
}

/** Tests only. */
export function resetTourBootHoldForTests(): void {
  clearPending();
}
