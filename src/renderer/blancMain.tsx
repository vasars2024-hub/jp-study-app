/**
 * Entry point for the Blanc Toolbox window (BLANC_REFINEMENT_PLAN.md Pillar 1).
 *
 * Blanc used to boot from `main.tsx` with `?blanc=1`, which meant the "fast
 * toolbox" paid for the entire Study OS before it painted: the desktop shell,
 * the widget registry, the city engine and its session loop, the environment /
 * weather layers, every theme pack, and the storage migration runner. None of
 * that is reachable from BlancShell.
 *
 * This module boots ONLY what Blanc actually uses. Anything added here should
 * be justified by a Blanc surface that needs it — if it is only for the Study
 * OS desktop, it belongs in `main.tsx`.
 *
 * The paired HTML entry is `blanc.html`; `vite.renderer.config.ts` emits both,
 * and `main.ts` points the Blanc window at it.
 */
import React, { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import BlancShell, { BlancLockscreen } from './components/blanc/BlancShell';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import ToastHost from './components/ToastHost';
import GlobalDictionaryOverlay from './components/GlobalDictionaryOverlay';
import { applyZoom, installZoomResizeHook, loadZoom } from './appZoom';
import { applyLangAttribute, initI18n } from './i18n';
import { applyBlancModeClass } from './blancMode';
import { applyBlancTheme } from './blancThemeApply';
import { applyBlancCustomCss } from './blancCustomCssApply';
import { loadToolboxSettings } from './toolboxSettings';
import { bootTheme, onThemeChanged } from './theme';
import { initProfileState } from './profileState';
import { installKeyboardShortcuts } from './keyboardShortcuts';
import { installBlancConsoleCapture } from './blancConsole';
import { installNotificationCapture } from './notificationStore';
import { clearOnExitIfConfigured } from './clipboardHistory';
import { markLockscreenUnlocked, shouldShowLockscreen } from './lockscreenSettings';

// Blanc's own tokens + the base stylesheet its panels inherit from. Study OS's
// theme packs (aero, wired, materials, environment, city) are deliberately absent.
import './theme/tokens.css';
// styles.css is NOT booted here: it is 468 KB of Study OS rules that only the
// ported panels need, and they pull it lazily via theme/studyos-compat.css.
// Blanc's own page baseline now lives in theme/blanc.css.
import './components/ui/ui.css';
import './theme/a11y.css';
import './theme/blanc.css';

window.addEventListener('beforeunload', clearOnExitIfConfigured);

// Same diagnostic forwarding main.tsx installs — a crash in the Blanc window
// should reach the main-process log rather than vanishing.
window.addEventListener('error', (event) => {
  void window.api
    ?.logRendererError?.({
      subsystem: 'blanc',
      operation: 'windowError',
      detail: `${event.message} @ ${event.filename}:${event.lineno}\n${event.error?.stack ?? ''}`,
    })
    .catch(() => undefined);
});
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const detail = reason instanceof Error ? reason.stack || reason.message : String(reason);
  void window.api
    ?.logRendererError?.({ subsystem: 'blanc', operation: 'unhandledRejection', detail })
    .catch(() => undefined);
});

applyZoom(loadZoom());
installZoomResizeHook();
bootTheme();
// Blanc has its own visual language and must never adopt Study OS's secret
// material packs (aero/wired). `bootTheme` stamps `data-materials` from the
// shared theme choice; strip it here (and on every theme switch) so
// `useAeroMaterials()`/`useWiredMaterials()` stay false in Blanc and shared
// content components always render their default, Blanc-native branch.
function stripStudyOsMaterials(): void {
  document.documentElement.removeAttribute('data-materials');
}
stripStudyOsMaterials();
onThemeChanged(stripStudyOsMaterials);
// Belt and suspenders: any code path that re-stamps `data-materials` (a theme
// re-apply that doesn't fire onThemeChanged, a late boot subsystem) is undone
// immediately, so Blanc never flashes the aero/wired look.
if (typeof MutationObserver !== 'undefined') {
  new MutationObserver(() => {
    if (document.documentElement.hasAttribute('data-materials')) stripStudyOsMaterials();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-materials'] });
}
applyBlancModeClass();
// Theme + custom CSS (Pillar 4) must apply at boot, not lazily when the settings
// panel first mounts: the settings panel is only rendered on the Settings tab, so
// without this a saved theme would not paint until the user visited it, and — more
// importantly — the custom-CSS lockout guard would be absent on every other tab.
const bootToolbox = loadToolboxSettings();
applyBlancTheme(bootToolbox.themePreset, bootToolbox.themeOverrides);
applyBlancCustomCss(bootToolbox.customCss);
applyLangAttribute();
installNotificationCapture();
installBlancConsoleCapture();
installKeyboardShortcuts();
// BlancDeckPanel reads the active profile's Anki deck name.
void initProfileState().catch((err) => console.error('[profileState] init failed:', err));

function BlancRoot() {
  const [locked, setLocked] = useState(() => shouldShowLockscreen());

  const onUnlocked = useCallback(() => {
    markLockscreenUnlocked();
    setLocked(false);
    void window.api?.lockscreenUnlock?.();
  }, []);

  return (
    <>
      {locked ? (
        <BlancLockscreen onUnlocked={onUnlocked} />
      ) : (
        // No initial book: a standalone Blanc window is not handed one at boot.
        // Opening a book from the Read tab is BlancShell's own internal state.
        <BlancShell initialBook={null} onInitialBookConsumed={() => undefined} />
      )}
      <GlobalDictionaryOverlay />
      <ToastHost />
    </>
  );
}

const container = document.getElementById('root');
if (container) {
  // See main.tsx: catalogs are per-language chunks and t() is synchronous, so
  // the active one must resolve before the first paint or a non-English UI
  // flashes English. English is already loaded — a microtask for most sessions.
  void initI18n().then(() => {
    createRoot(container).render(
      <React.StrictMode>
        <AppErrorBoundary>
          <BlancRoot />
        </AppErrorBoundary>
      </React.StrictMode>,
    );
    applyZoom(loadZoom());
  });
}
