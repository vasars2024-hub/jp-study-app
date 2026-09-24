// (widget system loaded via App → DesktopShell)
// FIRST, before react-dom evaluates: the dev-only `?noReactTrack` switch.
import './reactTrackHatch';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import SystemDictOverlay from './components/SystemDictOverlay';
import ReadingLensOverlay from './components/lens/ReadingLensOverlay';
import { installVisualNovelStudyTimeSync } from './visualNovelStudyTime';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { withStrictMode } from './strictRoot';
import { applyZoom, installZoomResizeHook, loadZoom } from './appZoom';
import { bootOsLook } from './components/DesktopSettings';
import { bootDisplayPrefs, loadDisplayPrefs } from './displayPrefs';
import { bootMotionPrefs } from './motion/motionPrefs';
import { installRewardBursts } from './motion/rewardBurst';
import { bootWindowChrome } from './windowChrome';
import { bootTheme, onThemeChanged } from './theme';
import { applyLangAttribute, initI18n } from './i18n';
import { bootEnvironment } from './environment';
import { installAmbientAudio } from './environment/ambientAudio';
import { bootCustomCss } from './customCss';
import { bootUiCustomization } from './uiCustomizationStore';
import { runStorageMigrations } from './storage/migrationRunner';
import { initProfileState } from './profileState';
import { initDesktopState } from './desktopState';
import { installKeyboardShortcuts } from './keyboardShortcuts';
import { clearOnExitIfConfigured } from './clipboardHistory';
import { startReleaseCheck } from './releaseCheck';
import { showCrashRecoveryNotice } from './crashRecoveryNotice';
// Design-token foundation (Phase 1 · M1) — additive tier layer loaded BEFORE
// styles.css so the existing :root stays authoritative on any shared name.
import './theme/tokens.css';
import './styles.css';
// Material library + secret Frutiger Aero theme (Phase 1 · M3), loaded AFTER
// styles.css so material utilities and the [data-theme='frutiger-aero'] block win.
import './theme/materials.css';
import './theme/frutiger-aero.css';
import './theme/wired-archive.css';
// Typography roles, colour helpers, and the reduced-motion-aware motion system
// (Phase 1 · M4). Additive utility layers.
import './theme/typography.css';
import './theme/motion.css';
// Phase 4.5 motion system — loaded after motion.css so the snap override and
// the meter/badge/morpheme rules win over the Aero utility layer.
import './motion/motion-system.css';
// UI primitive library styles (Phase 1 · M5).
import './components/ui/ui.css';
// Accessibility foundation (Phase 1 · M8) — imported late to reinforce.
import './theme/a11y.css';
import './theme/aero-safe-mode.css';
// Performance tiers (Phase 1 · M9).
import './theme/perf.css';
// Liquid Workplace semantic tokens (L2). Declares --lq-* custom properties on
// :root only, so it restyles nothing; liquidTokens.test.ts enforces that.
import './theme/liquid-tokens.css';
// Liquid Workplace surface primitives (L2). Paints, but only inside the `lq-`
// class namespace nothing else uses; liquidSurfaces.test.ts enforces that.
import './theme/liquid-surfaces.css';
import './theme/liquid-scaffold.css';
import './theme/liquid-controls.css';
// Liquid Workplace per-window presentation (L3). Paints only under
// `.fwin-liquid`, which no window carries unless the user opts it in.
import './theme/liquid-window.css';
// Shell panel base styles (Phase 2) — Notification Center, Quick Settings.
import './components/shell/shell.css';
// Multi-monitor desktops, cross-monitor drag ghost, drop router, and the two
// settings pages they add. Its own sheet — styles.css is single-owner.
import './multiMonitor.css';
// Aero desktop-shell glass (Phase 2 · M1) — scoped to [data-materials='aero'],
// loaded after shell.css so Aero flyout/palette corrections win over base shell styles.
import './theme/aero-shell.css';
import './theme/wired-shell.css';
// WIRED ARCHIVE shared motion library (bespoke spec §1–§2) — wm-* keyframes
// and the window-lifecycle visuals; loaded after wired-shell.css so its
// lifecycle rules win over the base fwin styling.
import './theme/wired-motion.css';
// WIRED ARCHIVE widget instruments (bespoke spec §6).
import './theme/wired-widgets.css';
// XP–Aero application grammar (Phase 4 · M1) — scoped to [data-materials='aero'],
// loaded after ui.css so the density/material overrides win. Default apps unchanged.
import './theme/aero-apps.css';
import './theme/wired-apps.css';
import './theme/blanc.css';
// Living-desktop weather overlays (Phase 3 · M3) + atmosphere polish (M5/M6).
import './environment/weather.css';
import './environment/atmosphere.css';
// Last of the stylesheets on purpose: `flatten.css` mirrors rules from every
// sheet above it (and from six component sheets that are imported lazily by
// their own components), so it is written to out-specify each of them rather
// than to win on order — but importing it last keeps the two consistent.
import './theme/flatten.css';
import { registerFrutigerAero } from './theme/frutiger-aero';
import { registerWiredArchive } from './theme/wired-archive';
import { installNotificationCapture } from './notificationStore';
import { installWatchAiringNotifications } from './watchAiringNotifications';
import { installCalendarReminders } from './calendarReminders';
import { deliverCalendarReminders } from './calendarReminderDelivery';
import { bootWallpaperFit } from './wallpaperFit';
import { bootAppBorderSettings } from './appBorderSettings';
import { installShellSounds } from './shellSounds';
import { bootPerf } from './theme/perf';
import { bootGpuFallback } from './theme/gpuFallback';
import { bootFlatten } from './theme/flatten';
import { installAssetPackSync } from './theme/assetPacks';
import { installGlobalInteractionBudget } from './perf/perfHub';
import { registerAeroProofSoundPack } from './audio/aeroProofPack';
import { registerWiredArchiveSoundPack } from './audio/wiredArchivePack';
import { bootWiredArchiveSettings } from './terminalModeSettings';
import { installWiredArchiveLifecycle } from './wiredArchiveLifecycle';
import { applyBlancModeClass, isBlancWindow } from './blancMode';
import { initAgentOperationalState } from './agentOperationalClient';
import { installLocalAgentAutomationHost } from './localAgentAutomationHost';
import { bootAeroSafeMode } from './aeroSafeMode';

// Lazy: the reader pulls the tokenizer and the mining path, which no other
// window should pay for at boot.
const VisualNovelReaderOverlay = React.lazy(() => import('./components/immersion/VisualNovelReaderOverlay'));

// Hydrates this window's view of the main-owned Agent queue, memory and
// automations, and performs the one-way localStorage adoption. The schedule
// itself is main's now, so nothing is pushed the other way at boot.
void initAgentOperationalState();

window.addEventListener('beforeunload', clearOnExitIfConfigured);

// Previously nothing captured these outside a dev console (PHASE_6_5_AUDIT.md
// Phase 8 gap) — forward to the main-process diagnostic log. Never sends
// event.error's arbitrary payload verbatim beyond message/stack (no DOM
// nodes, no document content).
window.addEventListener('error', (event) => {
  void window.api
    ?.logRendererError?.({
      subsystem: 'renderer',
      operation: 'windowError',
      detail: `${event.message} @ ${event.filename}:${event.lineno}\n${event.error?.stack ?? ''}`,
    })
    .catch(() => undefined);
});
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const detail = reason instanceof Error ? reason.stack || reason.message : String(reason);
  void window.api
    ?.logRendererError?.({ subsystem: 'renderer', operation: 'unhandledRejection', detail })
    .catch(() => undefined);
});

const isCompanionHost =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('companionHost') === '1';

// Dedicated frameless/transparent overlay window for the system-wide popup
// dictionary (main/systemDictionary.ts). It reuses the dictionary popup only —
// none of the desktop shell, environment, or migration boot should run.
const isSysDictOverlay =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('sysDict') === '1';
if (isSysDictOverlay) {
  document.documentElement.classList.add('sysdict-window');
}

// Fullscreen transparent click-through overlay for the Reading Lens
// (main/readingLens.ts): screen-region OCR + in-place lookup over any app.
// Like the sysDict overlay, none of the desktop shell/environment boot should run.
const isReadingLens =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('readingLens') === '1';
if (isReadingLens) {
  document.documentElement.classList.add('reading-lens-window');
}

// The Visual Novel reader beside a running game (main/immersion/visualNovelReaderWindow.ts).
// Same rule as the two overlays above: no shell or environment boot.
const isVnReader =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('vnReader') === '1';
if (isVnReader) {
  document.documentElement.classList.add('vn-reader-window');
}

function runWhenIdle(fn: () => void, timeout = 5000): void {
  const idle = window.requestIdleCallback as
    | ((cb: IdleRequestCallback, opts?: IdleRequestOptions) => number)
    | undefined;
  if (idle) {
    idle(fn, { timeout });
    return;
  }
  window.setTimeout(fn, Math.min(timeout, 1500));
}

function prewarmTokenizerLater(): void {
  runWhenIdle(() => {
    import('./tokenizer')
      .then(({ getTokenizer, tokenizeSync }) =>
        getTokenizer().then(() => {
          if (import.meta.env.DEV) {
            const toks = tokenizeSync('食べました');
            console.log(`[tokenizer] SELFTEST OK: ${toks.map((t) => `${t.surface}→${t.lemma}`).join(', ')}`);
            import('./wordHighlight').then(({ highlightEl }) => {
              const div = document.createElement('div');
              div.innerHTML = '<p>昨日は美味しい寿司を食べました。</p>';
              highlightEl(div);
              const spans = div.querySelectorAll('span.wk');
              console.log(
                `[highlight] SELFTEST spans=${spans.length}: ${[...spans].map((s) => `${s.textContent}(${s.className})`).join(' ')}`,
              );
            });
          }
        }),
      )
      .catch((e) => console.error('[tokenizer] preload failed:', e?.message ?? e));
  }, 10000);
}

// Restore the saved accessibility zoom + OS look (theme, accent, motion)
// before paint so there is no flash of the default look.
// #root is sized to (100/zoom)vw×vh then zoomed so the shell always fills
// the window (no top-left pin / blank void, no clipped taskbar).
applyZoom(loadZoom());
installZoomResizeHook();
// Register the secret Aero theme BEFORE bootTheme() so a persisted 'frutiger-aero'
// selection is recognised and re-applied on launch.
registerFrutigerAero();
registerWiredArchive();
bootTheme();
bootAeroSafeMode();
// The Blanc window (index.html?blanc=1) shares this entry with Study OS, but
// has its own visual language and must never adopt the secret material packs
// (aero/wired). Strip `data-materials` after bootTheme and keep it stripped, so
// `useAeroMaterials()`/`useWiredMaterials()` stay false and Blanc renders its
// own flat, sharp look regardless of the shared theme choice. The dedicated
// blancMain.tsx entry does the same.
//
// CORRECTION (L9 bullet 4): this used to say the fallback entry "is actually
// loaded today". It is not, and has not been since the Pillar 1 bundle split —
// `main.ts:545` loads `blanc.html?blanc=1` in dev and packaged alike,
// `blanc.html:14` points at blancMain.tsx, and `blanc-harness.html:175` does
// too. Nothing in the tree now loads main.tsx with `?blanc=1`. Kept anyway,
// because if anything ever does, this is the ONLY defence in that window:
// main.tsx imports styles.css and every secret material pack, so it really does
// own a `:root[data-theme='wired-archive']` palette block, and stripping
// data-materials does NOT stop that palette (measured: --bg #0c1410 → #02070d
// with materials already absent). blancMain.tsx is safe instead by NOT
// importing those sheets — guarded by `__tests__/secretIdentityScope.test.ts`.
if (isBlancWindow()) {
  const stripStudyOsMaterials = (): void =>
    document.documentElement.removeAttribute('data-materials');
  stripStudyOsMaterials();
  onThemeChanged(stripStudyOsMaterials);
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(() => {
      if (document.documentElement.hasAttribute('data-materials')) stripStudyOsMaterials();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-materials'] });
  }
}
applyBlancModeClass();
// Sets <html lang> from the saved UI language before first paint — CJK glyph
// shapes depend on it, so doing it later would flash the wrong forms.
applyLangAttribute();
bootOsLook();
bootDisplayPrefs();
// Motion tokens + velocity scaling (Phase 4.5). AFTER bootDisplayPrefs, which
// owns the underlying animation level this reads; pre-paint so the first frame
// already uses the user's timing rather than snapping to it a frame later.
bootMotionPrefs();
void bootWindowChrome(loadDisplayPrefs().windowChromeMode);
// Apply the saved performance tier (data-perf) pre-paint (Phase 1 · M9).
bootPerf();
// ...and the tier the MACHINE forces, which `data-perf` cannot express: it is a
// saved user preference with no hardware detection behind it, so a box with no
// accelerated compositing still asked for 8px of backdrop blur everywhere. Also
// arms the `webglcontextlost`/`restored` pair, which is L11's "GPU-loss
// recovery" — after bootPerf so the attribute it writes lands on top.
bootGpuFallback();
// ...and the OR of all six "stop painting translucent material" states, written
// to the root as `data-lq-flat`. After bootPerf/bootGpuFallback/bootAeroSafeMode
// so the first frame is already correct; a MutationObserver keeps it correct
// afterwards, so this is not order-critical beyond that first paint.
bootFlatten();
installGlobalInteractionBudget();
bootWiredArchiveSettings();
// Register the original source-generated Aero proof sounds before themes resolve
// their asset packs (Phase 5 · M4).
registerAeroProofSoundPack();
registerWiredArchiveSoundPack();
// Capture transient toasts into the Notification Center history (Phase 2 · M6).
installNotificationCapture();
// New episodes of titles being watched, from the airing-schedule job.
installWatchAiringNotifications();
// Wallpaper fit (--wall-fit) pre-paint.
bootWallpaperFit();
bootAppBorderSettings();
installWiredArchiveLifecycle();
runWhenIdle(() => {
  // Sound/asset hooks are nice-to-have; let the shell paint first.
  installAssetPackSync();
  installShellSounds();
}, 3000);

if (!isCompanionHost && !isSysDictOverlay && !isReadingLens && !isVnReader) {
  bootCustomCss();
  // Theme Studio's active theme was painted only while Settings > Appearance was
  // open, so a restart dropped it until then. Paint it at boot like the sandbox.
  bootUiCustomization();
  // Reward confetti layer (Phase 4.5). Main window only — the companion host
  // is a click-through overlay and must never paint a full-screen canvas.
  installRewardBursts();
  // The claimant for scheduled automations. Inside this guard on purpose: the
  // overlays and the companion host are transient windows, and letting them
  // claim would make delivery flap with whichever one happens to be open. Not
  // deferred to idle either — the scheduler ticks every 30s and a fire that
  // arrives before the claim is recorded `missed` for the rest of the day.
  installLocalAgentAutomationHost();
  // Finished VN sessions are timed in main; bank them in the shared study stats.
  installVisualNovelStudyTimeSync();
  // Calendar reminders fire from the primary desktop window only (the function
  // checks), so windows sharing localStorage never deliver one reminder twice.
  // Not deferred: its first tick is the launch catch-up for anything missed.
  installCalendarReminders(deliverCalendarReminders);
  runWhenIdle(() => {
    bootEnvironment();
    // Per-environment ambient soundscapes are dormant until a sound pack exists.
    installAmbientAudio();
  }, 2500);
  runWhenIdle(() => {
    // Move legacy localStorage data into IndexedDB after the shell can respond.
    runStorageMigrations().catch((err) => {
      const detail =
        err instanceof Error
          ? err.message
          : err && typeof err === 'object' && 'message' in err
            ? String((err as { message: unknown }).message)
            : String(err);
      console.warn('[storage] migration skipped:', detail || 'unknown error');
    });
  }, 8000);
  runWhenIdle(() => {
    initProfileState().catch((err) => console.error('[profileState] init failed:', err));
    initDesktopState().catch((err) => console.error('[desktopState] init failed:', err));
  }, 3500);

  prewarmTokenizerLater();

  installKeyboardShortcuts();
  runWhenIdle(startReleaseCheck, 12000);
  // A window main reloaded after a renderer crash says so (crashRecovery.ts).
  runWhenIdle(() => void showCrashRecoveryNotice(), 4000);
  // At most once a day, well after startup and only when idle: an automatic
  // backup. The renderer collects its snapshot; main writes the zip.
  window.setTimeout(() => {
    runWhenIdle(() => {
      void import('./storage/backupClient').then((m) => m.runAutoBackupIfDue());
    }, 60_000);
  }, 90_000);
}

const container = document.getElementById('root');
if (container) {
  // Resolve the active UI catalog before the first render. Catalogs are
  // per-language chunks now, and t() is synchronous — rendering first would
  // paint English and then flip once the chunk landed, a visible flash on every
  // boot in a non-English UI. English is the default and is already loaded, so
  // for most sessions this costs a microtask, not a fetch.
  void initI18n().then(async () => {
    if (isSysDictOverlay) {
      // Profile state powers the popup's Anki mining target; nothing else boots.
      initProfileState().catch((err) => console.error('[profileState] init failed:', err));
      createRoot(container).render(
        withStrictMode(
          <AppErrorBoundary>
            <SystemDictOverlay />
          </AppErrorBoundary>,
        ),
      );
    } else if (isVnReader) {
      // Mining writes to the active profile's deck; nothing else boots.
      initProfileState().catch((err) => console.error('[profileState] init failed:', err));
      createRoot(container).render(
        withStrictMode(
          <AppErrorBoundary>
            <React.Suspense fallback={null}>
              <VisualNovelReaderOverlay />
            </React.Suspense>
          </AppErrorBoundary>,
        ),
      );
    } else if (isReadingLens) {
      // Mining target comes from the active profile; the shell/environment stay dormant.
      initProfileState().catch((err) => console.error('[profileState] init failed:', err));
      createRoot(container).render(
        withStrictMode(
          <AppErrorBoundary>
            <ReadingLensOverlay />
          </AppErrorBoundary>,
        ),
      );
    } else {
      await import('./levelLists')
        .then(({ restoreLevelListsFromIdb }) => restoreLevelListsFromIdb())
        .catch((err) => console.warn('[level-lists] startup restore skipped:', err));
      // The deck and word knowledge have a durable IndexedDB copy; reconcile it
      // with the localStorage cache before anything reads or writes either.
      await Promise.all([
        import('./flashcardDeck').then(({ restoreDeckFromIdb }) => restoreDeckFromIdb()),
        import('./knownWords').then(({ restoreKnowledgeFromIdb }) => restoreKnowledgeFromIdb()),
        // Both swallow their own read errors; a failure here only means the
        // localStorage cache keeps serving, exactly as before.
      ]).catch(() => undefined);
      createRoot(container).render(
        withStrictMode(
          <AppErrorBoundary>
            <App />
          </AppErrorBoundary>,
        ),
      );
      // Re-apply after mount so compensated size is correct once #root is live.
      applyZoom(loadZoom());
    }
  });
}
