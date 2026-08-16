/**
 * Protected-system probe — "Secret Aero discovery and exit" + "Aero safe mode".
 *
 * WHY THIS SHAPE. The original recipe said "perform the discovery gesture". That
 * is FORBIDDEN (`.claude/skills/jp-bridge/SKILL.md` §2): `SecretAeroTrigger.toggle()`
 * calls `armLockscreenOnSecretEntry()`, and the return trip fires
 * `restoreStudyEnvironmentAfterAero()`, which overwrites `jp-aero-environment-v1`
 * against a profile with no restore point. That key is NOT hypothetical — it holds a
 * real ~6 KB populated blob on this machine (measured 2026-08-17).
 *
 * Calling `setTheme(AERO_THEME_ID)` directly does not help: `installAeroEnvironmentBridge`
 * subscribes to `onThemeChanged` and fires the same restore on the way back out.
 *
 * So this probe drives the DOM presentation attributes the material layer is keyed
 * off — `data-materials` and `data-aero-safe-mode` — and never the theme. Both are
 * runtime-only; `aeroSafeMode.ts`'s own header states safe mode "never edits the
 * environment, display, sound, companion, wallpaper, or study-data stores".
 *
 * SCOPE LIMIT, stated rather than buried: this covers the Aero **material/CSS layer**.
 * It does NOT cover the React `useAeroMaterials()` branch (`AppChrome.tsx:31`), which
 * re-reads only on `onThemeChanged` — reaching it requires the forbidden write above.
 *
 * Run: `node debug/evfile.cjs src/.coordination/liquid-workplace/probes/aero-materials-parity.js`
 * (or any /eval poster). Restores unconditionally in `finally`; asserts byte-for-byte.
 */
(() => {
  const root = document.documentElement;
  const KEYS = [
    'jp-os-aero-safe-mode-v1',
    'jp-aero-environment-v1',
    'jp-study-environment-backup-v1',
    'jp-aero-restore-theme-v1',
  ];
  const before = {};
  for (const k of KEYS) before[k] = localStorage.getItem(k);

  const attrBefore = {
    materials: root.getAttribute('data-materials'),
    theme: root.getAttribute('data-theme'),
    aeroSafeMode: root.getAttribute('data-aero-safe-mode'),
  };

  const LIVING =
    '.os-particle-canvas, .os-weather, .os-day-lighting, .os-companion-layer, .os-companion-host-root, .os-wall-video';

  const measure = (label) => {
    const fwins = [...document.querySelectorAll('.fwin')];
    const f = fwins[0] || null;
    const cs = f ? getComputedStyle(f) : null;
    const tb = document.querySelector('.os-taskbar');
    const tbcs = tb ? getComputedStyle(tb) : null;
    return {
      label,
      attrs: {
        materials: root.getAttribute('data-materials'),
        aeroSafeMode: root.getAttribute('data-aero-safe-mode'),
      },
      fwinCount: fwins.length,
      fwinTitles: fwins.map((w) => (w.querySelector('.fwin-title-text')?.textContent || '').trim()),
      fwinBackdrop: cs ? cs.backdropFilter : null,
      fwinBorderRadius: cs ? cs.borderTopLeftRadius : null,
      fwinTransitionDuration: cs ? cs.transitionDuration : null,
      taskbarBackground: tbcs ? tbcs.backgroundImage.slice(0, 60) : null,
      livingTotal: document.querySelectorAll(LIVING).length,
      livingDisplayed: [...document.querySelectorAll(LIVING)].filter(
        (el) => getComputedStyle(el).display !== 'none',
      ).length,
      triggerPresent: !!document.querySelector('.aero-secret-trigger'),
      exitTarget: localStorage.getItem('jp-aero-restore-theme-v1'),
    };
  };

  const out = { attrBefore, steps: [] };
  try {
    out.steps.push(measure('A-baseline-study-os'));
    root.setAttribute('data-materials', 'aero');
    out.steps.push(measure('B-materials-aero'));
    root.setAttribute('data-aero-safe-mode', 'on');
    out.steps.push(measure('C-materials-aero+safe-on'));
    root.setAttribute('data-aero-safe-mode', 'off');
    out.steps.push(measure('D-materials-aero+safe-off'));
  } finally {
    if (attrBefore.materials === null) root.removeAttribute('data-materials');
    else root.setAttribute('data-materials', attrBefore.materials);
    if (attrBefore.aeroSafeMode === null) root.removeAttribute('data-aero-safe-mode');
    else root.setAttribute('data-aero-safe-mode', attrBefore.aeroSafeMode);
    out.steps.push(measure('E-restored'));
  }

  out.storeIntact = {};
  for (const k of KEYS) out.storeIntact[k] = localStorage.getItem(k) === before[k];
  out.storeAllIntact = Object.values(out.storeIntact).every(Boolean);
  out.attrsRestored =
    root.getAttribute('data-materials') === attrBefore.materials &&
    root.getAttribute('data-aero-safe-mode') === attrBefore.aeroSafeMode &&
    root.getAttribute('data-theme') === attrBefore.theme;

  // The probe is VOID unless forcing the material set actually moved something:
  // a control that does not invert cannot certify the row.
  const a = out.steps[0];
  const b = out.steps[1];
  out.controlInverted = a.fwinBackdrop !== b.fwinBackdrop && a.taskbarBackground !== b.taskbarBackground;
  return out;
})()
