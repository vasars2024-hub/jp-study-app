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
import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import BlancShell, { BlancLockscreen } from './components/blanc/BlancShell';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { withStrictMode } from './strictRoot';
import ToastHost from './components/ToastHost';
import GlobalDictionaryOverlay, { setPopupStyleLoader } from './components/GlobalDictionaryOverlay';
import { ensureStudyOsCompat } from './blancStudyOsCompat';
import { syncStudyLangToMain } from './studyEnvironment';
import { applyZoom, installZoomResizeHook, loadZoom } from './appZoom';
import { applyLangAttribute, initI18n } from './i18n';
import { applyBlancModeClass } from './blancMode';
import { applyBlancTheme } from './blancThemeApply';
import { applyBlancCustomCss } from './blancCustomCssApply';
import { loadToolboxSettings } from './toolboxSettings';
import { bootTheme, onThemeChanged } from './theme';
import { initProfileState } from './profileState';
import { installKeyboardShortcuts } from './keyboardShortcuts';
import { startAiSetupSync } from './aiSetupClient';
import { installBlancConsoleCapture } from './blancConsole';
import { installNotificationCapture } from './notificationStore';
import { clearOnExitIfConfigured } from './clipboardHistory';
import { markLockscreenUnlocked, shouldShowLockscreen, syncLockscreenToMain } from './lockscreenSettings';
import { initAgentOperationalState } from './agentOperationalClient';
import { awaitStartupRestore } from './startupRestore';

// Blanc's own tokens + the base stylesheet its panels inherit from. Study OS's
// theme packs (aero, wired, materials, environment, city) are deliberately absent.
import './theme/tokens.css';
// The Liquid vocabulary, earned by this file's own rule — three panels Blanc
// mounts read `--lq-*`: GameArena (gameArenaLiquid.css), CalendarContent
// (calendarLiquid.css) and TranscriptionCardOptions (transcriptionCards.css).
// Without it every one of those declarations was guaranteed-invalid and simply
// dropped: Blanc's calendar toolbar measured `gap: normal` and `min-height:
// auto` where the sheet asks for `--lq-space-4` and `--lq-hit-target`. Tokens
// only, ~2 KB, and it cannot restyle anything on its own (`liquidTokens.test.ts`
// pins that structurally).
import './theme/liquid-tokens.css';
import './theme/liquid-surfaces.css';
// styles.css is NOT booted here: it is ~800 KB of Study OS source (~500 KB
// built) that only the ported panels need. They pull it on demand through
// blancStudyOsCompat.ts (theme/studyos-compat.css, layered), and nothing at
// startup may — blancBootGraph.test.ts guards it. Blanc's own page baseline
// lives in theme/blanc.css.
import './components/ui/ui.css';
import './theme/a11y.css';
import './theme/blanc.css';
// AFTER blanc.css, because it reads `--blanc-*`: the Blanc-native remap of the
// four Liquid roles. The base sheet above derives from `--panel`/`--glass-*`,
// which still hold Study OS values in this window, so importing it alone would
// have dressed Blanc in the Study OS material. This is the adapter that stops it.
import './theme/blanc-liquid.css';
import './theme/blanc-shell-liquid.css';
// Native component accessibility repairs belong outside the token-only adapter.
import './theme/blanc-shell-a11y.css';

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
// Earns its place by this file's own rule: `LocalAgentPanel` in
// BlancReadyToolPanels is a Blanc surface, and it reads the Agent's task queue,
// memory and automations. Those are main-owned now, so this window has to
// hydrate them itself — the Study OS entry doing it does nothing for Blanc, and
// without this the same queue renders full in one window and empty in the other.
void initAgentOperationalState();
// Main reads the study language for transcription, mining and the extension;
// Study OS's entry pushes it at boot, and a Blanc-only session has no Study OS.
syncStudyLangToMain();
// The global lookup popups render Study OS class names (`dict-*`, `tr-popup-*`);
// Blanc loads that sheet only when a popup is about to open.
setPopupStyleLoader(ensureStudyOsCompat);
// Extension mining, Whisper requests, reminders, the pending-Anki replay and
// the automation host — run here only while no Study OS window is alive
// (blancBackgroundJobs.ts). Dynamically imported: not startup cost.
void import('./blancBackgroundJobs')
  .then(({ installBlancBackgroundJobs }) => installBlancBackgroundJobs())
  .catch((err) => console.warn('[blanc] background jobs unavailable:', err));
// Anki review sync: a card graded here is queued for Anki even while Study OS
// runs the background jobs (opt-in; shared/ankiReviewSync.ts). Loaded after
// first paint, not as startup cost.
window.setTimeout(() => {
  void import('./ankiReviewSync')
    .then(({ installAnkiReviewCapture }) => installAnkiReviewCapture())
    .catch((err) => console.warn('[blanc] Anki review capture unavailable:', err));
}, 3000);

function BlancRoot() {
  const [locked, setLocked] = useState(() => shouldShowLockscreen());

  // Main owns the lock (main/lockscreenPin.ts, lockGuard.ts). Blanc used to read
  // only its own session flag, so a lock armed elsewhere — the Study OS "lock now",
  // Secret OS entry, a Blanc-only launch main had not adopted yet — never reached
  // it. Mirror the settings to main (adopted once, as Study OS does), take on a
  // lock main holds or arms later, and drop it when another window unlocks.
  useEffect(() => {
    syncLockscreenToMain(undefined, shouldShowLockscreen());
    let alive = true;
    void window.api?.lockscreenIsLocked?.()
      .then((mainLocked) => {
        if (alive && mainLocked) setLocked(true);
      })
      .catch(() => undefined);
    const offLocked = window.api?.onLockscreenLocked?.(() => setLocked(true));
    const offUnlocked = window.api?.onLockscreenUnlocked?.(() => {
      markLockscreenUnlocked();
      setLocked(false);
    });
    return () => {
      alive = false;
      offLocked?.();
      offUnlocked?.();
    };
  }, []);

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
  void initI18n().then(async () => {
    startAiSetupSync();
    // The deck, word knowledge and level lists have a durable IndexedDB copy;
    // reconcile it with the localStorage cache before anything reads or writes
    // either — the same restore Study OS's entry runs. Without it a Blanc-only
    // session whose localStorage cache was lost would write the empty cache
    // over the durable deck on its first change.
    const restores = (async () => {
      await import('./levelLists')
        .then(({ restoreLevelListsFromIdb }) => restoreLevelListsFromIdb())
        .catch((err) => console.warn('[level-lists] startup restore skipped:', err));
      await Promise.all([
        import('./flashcardDeck').then(({ restoreDeckFromIdb }) => restoreDeckFromIdb()),
        import('./knownWords').then(({ restoreKnowledgeFromIdb }) => restoreKnowledgeFromIdb()),
        // Both swallow their own read errors; a failure here only means the
        // localStorage cache keeps serving, exactly as before.
      ]).catch(() => undefined);
    })();
    // A stalled IndexedDB must not leave Blanc blank: render on the
    // localStorage cache after STARTUP_RESTORE_TIMEOUT_MS and let the restore
    // finish in the background. The deck and knowledge restores re-read the
    // cache after their IndexedDB read (the deck also tracks cards created while
    // restoring), so a late finish does not clobber edits made after render;
    // level lists snapshot the cache first, so a list edited in that window
    // could lose to a late restore — accepted, it needs a >4 s IndexedDB stall.
    await awaitStartupRestore(restores, { label: 'blanc' });
    createRoot(container).render(
      withStrictMode(
        <AppErrorBoundary>
          <BlancRoot />
        </AppErrorBoundary>,
      ),
    );
    applyZoom(loadZoom());
  });
}
