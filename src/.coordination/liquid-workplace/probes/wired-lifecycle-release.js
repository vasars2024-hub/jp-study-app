/**
 * Protected-system probe — "Wired lifecycle" (release leg).
 *
 * Run after `wired-lifecycle-parity.js`. Reads the phases the sequence actually
 * published, asserts the desktop survived it, then restores everything the arm leg
 * touched and proves the restore byte-for-byte.
 *
 * Unconditional: run this even if the arm leg refused, and even if the sequence
 * never reached 'active'. Restoring is not contingent on the measurement passing.
 */
(() => {
  const p = window.__wiredProbe;
  const root = document.documentElement;
  if (!p) return { refuse: 'no armed probe — run wired-lifecycle-parity.js first' };

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
      taskbarEntries: document.querySelectorAll('.os-task-wins > *').length,
      taskbarPresent: document.querySelectorAll('.os-taskbar').length,
    };
  };

  const during = snapshot('after-sequence');
  const phases = p.phases.map((x) => ({ phase: x.phase, reason: x.reason, ms: x.at - p.startedAt }));
  const c = p.captured;

  try {
    window.removeEventListener('wired:lifecycle', p.onLifecycle);

    if (c.materials === null) root.removeAttribute('data-materials');
    else root.setAttribute('data-materials', c.materials);

    if (c.wiredLifecycle === null) root.removeAttribute('data-wired-lifecycle');
    else root.setAttribute('data-wired-lifecycle', c.wiredLifecycle);

    if (c.wiredLifecycleReason === null) root.removeAttribute('data-wired-lifecycle-reason');
    else root.setAttribute('data-wired-lifecycle-reason', c.wiredLifecycleReason);

    if (c.wiredAmbient === null) root.removeAttribute('data-wired-ambient');
    else root.setAttribute('data-wired-ambient', c.wiredAmbient);

    root.classList.toggle('wired-lifecycle-running', c.hadRunningClass);
    root.classList.toggle('wired-lifecycle-suspended', c.hadSuspendedClass);
    root.classList.toggle('reduce-motion', c.hadReduceMotion);

    // The one persisted write on the path: markWiredArchiveBootSeen().
    if (c.bootSeen === null) localStorage.removeItem(p.BOOT_SEEN);
    else localStorage.setItem(p.BOOT_SEEN, c.bootSeen);
  } finally {
    delete window.__wiredProbe;
  }

  const after = snapshot('restored');

  return {
    phases,
    phaseNames: phases.map((x) => x.phase),
    reachedActive: phases.some((x) => x.phase === 'active'),
    sawPreboot: phases.some((x) => x.phase === 'preboot'),
    before: p.before,
    during,
    after,
    // The freeze itself: open modules and desktop layout unchanged across the restart.
    desktopSurvived:
      during.fwinCount === p.before.fwinCount &&
      during.deskIcons === p.before.deskIcons &&
      during.taskbarEntries === p.before.taskbarEntries &&
      JSON.stringify(during.fwinTitles) === JSON.stringify(p.before.fwinTitles),
    restored: {
      materials: root.getAttribute('data-materials') === c.materials,
      wiredLifecycle: root.getAttribute('data-wired-lifecycle') === c.wiredLifecycle,
      wiredAmbient: root.getAttribute('data-wired-ambient') === c.wiredAmbient,
      reduceMotion: root.classList.contains('reduce-motion') === c.hadReduceMotion,
      runningClass: root.classList.contains('wired-lifecycle-running') === c.hadRunningClass,
      bootSeen: localStorage.getItem(p.BOOT_SEEN) === c.bootSeen,
      settings: localStorage.getItem(p.SETTINGS) === c.settings,
    },
  };
})()
