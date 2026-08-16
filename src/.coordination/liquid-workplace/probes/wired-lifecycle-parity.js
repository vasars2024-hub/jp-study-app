/**
 * Protected-system probe — "Wired lifecycle" (arm leg).
 *
 * Contract being frozen (`DesktopShell.tsx:2294`): a WIRED ARCHIVE restart runs its
 * boot sequence and comes back with open modules and the desktop layout still in place.
 *
 * WHY IT COULD NOT BE RUN BEFORE. `requestWiredArchiveRestart()` silently no-ops from
 * Study OS, because everything downstream gates on `isWiredTheme()`. The ledger recorded
 * that as needing "an environment switch, a persisted write".
 *
 * IT DOES NOT. `isWiredTheme()` (`wiredArchiveLifecycle.ts:72-78`) is satisfied by
 * `data-materials === 'wired'` **OR** the theme id — so the Aero rewrite's template
 * applies unchanged: set the attribute, never the theme. Confirmed by reading the
 * restart path end to end: `WIRED_RESTART_EVENT` → `beginEntry('restart', true)` →
 * `publish()` → `syncDocumentLifecycle()`. No `setTheme` anywhere on it. (`setTheme`
 * lives only in `enterWiredArchive`, which is the WIRED_ENTRY_EVENT path — not dispatched.)
 *
 * The three real side effects, each neutralised or captured rather than ignored:
 *   1. `markWiredArchiveBootSeen()` writes `jp-wired-archive-boot-seen-v1` at the end of
 *      the sequence — captured here and restored byte-exactly by the release leg.
 *   2. `syncAmbient()` would start an audio loop on 'active' — pre-gated off via
 *      `dataset.wiredAmbient = 'off'`, which is the check it already honours.
 *   3. A one-shot startup sound fires mid-sequence. Transient, no state; not suppressed.
 *
 * `reduce-motion` is added to take the sequence from 6.6 s to ~1 s (it is the same flag
 * `prefersReducedMotion()` already reads), and removed again on release.
 *
 * Run this file first, then `wired-lifecycle-release.js`. The release leg is
 * unconditional — run it even if this one reports a refusal.
 */
(() => {
  const root = document.documentElement;
  const BOOT_SEEN = 'jp-wired-archive-boot-seen-v1';
  const SETTINGS = 'jp-wired-archive-settings-v1';

  if (window.__wiredProbe) return { refuse: 'a probe is already armed — run the release leg first' };

  const captured = {
    materials: root.getAttribute('data-materials'),
    theme: root.getAttribute('data-theme'),
    wiredLifecycle: root.getAttribute('data-wired-lifecycle'),
    wiredLifecycleReason: root.getAttribute('data-wired-lifecycle-reason'),
    wiredAmbient: root.getAttribute('data-wired-ambient'),
    hadRunningClass: root.classList.contains('wired-lifecycle-running'),
    hadSuspendedClass: root.classList.contains('wired-lifecycle-suspended'),
    hadReduceMotion: root.classList.contains('reduce-motion'),
    bootSeen: localStorage.getItem(BOOT_SEEN),
    settings: localStorage.getItem(SETTINGS),
  };

  const snapshot = (label) => {
    const fwins = [...document.querySelectorAll('.fwin')];
    return {
      label,
      phase: root.getAttribute('data-wired-lifecycle'),
      reason: root.getAttribute('data-wired-lifecycle-reason'),
      runningClass: root.classList.contains('wired-lifecycle-running'),
      fwinCount: fwins.length,
      fwinTitles: fwins.map((w) => (w.querySelector('.fwin-title-text')?.textContent || '').trim()),
      deskIcons: document.querySelectorAll('.os-desk-icon').length,
      // `.os-task-wins` holds exactly one child per open window (DesktopShell.tsx:2847).
      taskbarEntries: document.querySelectorAll('.os-task-wins > *').length,
      taskbarPresent: document.querySelectorAll('.os-taskbar').length,
    };
  };

  const before = snapshot('before');

  // Arm: neutralise ambient, shorten the sequence, satisfy isWiredTheme().
  root.dataset.wiredAmbient = 'off';
  root.classList.add('reduce-motion');
  root.setAttribute('data-materials', 'wired');

  const phases = [];
  const onLifecycle = (e) => {
    const d = e.detail || {};
    phases.push({ phase: d.phase, reason: d.reason, message: d.message, at: Date.now() });
  };
  window.addEventListener('wired:lifecycle', onLifecycle);

  window.__wiredProbe = { captured, before, phases, onLifecycle, startedAt: Date.now(), BOOT_SEEN, SETTINGS };

  // Drive the real product entry point, not an internal. The event name is
  // `shell:wiredRestart` (wiredArchiveLifecycle.ts:57) — NOT `wired:restart`.
  // A wrong name here dispatches into nothing and reads exactly like the
  // product failing to boot, which is the false finding this row exists to avoid.
  window.dispatchEvent(new CustomEvent('shell:wiredRestart'));

  return { armed: true, before, materialsNow: root.getAttribute('data-materials') };
})()
