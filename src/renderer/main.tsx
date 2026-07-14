// (widget system loaded via App → DesktopShell)
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyZoom, installZoomResizeHook, loadZoom } from './appZoom';
import { bootOsLook } from './components/DesktopSettings';
import { bootDisplayPrefs } from './displayPrefs';
import { bootTheme } from './theme';
import { bootEnvironment } from './environment';
import { installAmbientAudio } from './environment/ambientAudio';
import { bootCustomCss } from './customCss';
import { runStorageMigrations } from './storage/migrationRunner';
import { initProfileState } from './profileState';
import { initDesktopState } from './desktopState';
import { installKeyboardShortcuts } from './keyboardShortcuts';
import { clearOnExitIfConfigured } from './clipboardHistory';
// Design-token foundation (Phase 1 · M1) — additive tier layer loaded BEFORE
// styles.css so the existing :root stays authoritative on any shared name.
import './theme/tokens.css';
import './styles.css';
// Material library + secret Frutiger Aero theme (Phase 1 · M3), loaded AFTER
// styles.css so material utilities and the [data-theme='frutiger-aero'] block win.
import './theme/materials.css';
import './theme/frutiger-aero.css';
// Typography roles, colour helpers, and the reduced-motion-aware motion system
// (Phase 1 · M4). Additive utility layers.
import './theme/typography.css';
import './theme/motion.css';
// UI primitive library styles (Phase 1 · M5).
import './components/ui/ui.css';
// Accessibility foundation (Phase 1 · M8) — imported late to reinforce.
import './theme/a11y.css';
// Performance tiers (Phase 1 · M9).
import './theme/perf.css';
// Shell panel base styles (Phase 2) — Notification Center, Quick Settings.
import './components/shell/shell.css';
// Aero desktop-shell glass (Phase 2 · M1) — scoped to [data-materials='aero'],
// loaded after shell.css so Aero flyout/palette corrections win over base shell styles.
import './theme/aero-shell.css';
// XP–Aero application grammar (Phase 4 · M1) — scoped to [data-materials='aero'],
// loaded after ui.css so the density/material overrides win. Default apps unchanged.
import './theme/aero-apps.css';
// Living-desktop weather overlays (Phase 3 · M3) + atmosphere polish (M5/M6).
import './environment/weather.css';
import './environment/atmosphere.css';
import { registerFrutigerAero } from './theme/frutiger-aero';
import { installNotificationCapture } from './notificationStore';
import { bootWallpaperFit } from './wallpaperFit';
import { bootAppBorderSettings } from './appBorderSettings';
import { installShellSounds } from './shellSounds';
import { bootPerf } from './theme/perf';
import { installAssetPackSync } from './theme/assetPacks';
import { registerAeroProofSoundPack } from './audio/aeroProofPack';

window.addEventListener('beforeunload', clearOnExitIfConfigured);

const isCompanionHost =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('companionHost') === '1';

// Restore the saved accessibility zoom + OS look (theme, accent, motion)
// before paint so there is no flash of the default look.
// #root is sized to (100/zoom)vw×vh then zoomed so the shell always fills
// the window (no top-left pin / blank void, no clipped taskbar).
applyZoom(loadZoom());
installZoomResizeHook();
// Register the secret Aero theme BEFORE bootTheme() so a persisted 'frutiger-aero'
// selection is recognised and re-applied on launch.
registerFrutigerAero();
bootTheme();
bootOsLook();
bootDisplayPrefs();
// Apply the saved performance tier (data-perf) pre-paint (Phase 1 · M9).
bootPerf();
// Register the original source-generated Aero proof sounds before themes resolve
// their asset packs (Phase 5 · M4).
registerAeroProofSoundPack();
// Keep the active theme's asset pack (sounds now; icons/wallpapers hooks) in
// sync on every theme change — the Anime Edition extension point (Phase 1 · M10).
installAssetPackSync();
// Capture transient toasts into the Notification Center history (Phase 2 · M6).
installNotificationCapture();
// Wallpaper fit (--wall-fit) pre-paint + shell sound routing (Phase 2 · M10/M11).
bootWallpaperFit();
bootAppBorderSettings();
installShellSounds();

if (!isCompanionHost) {
  bootCustomCss();
  bootEnvironment();
  // Per-environment ambient soundscapes (Phase 3 · M4) — silent until a sound
  // pack is added; dormant while the living layer is disabled.
  installAmbientAudio();
  // Move legacy localStorage data into IndexedDB (versioned, one-way, safe to
  // re-run). Fire-and-forget: readers fall back to localStorage until done.
  // Errors are handled inside the runner (warn + continue); keep a safety net.
  runStorageMigrations().catch((err) => {
    const detail =
      err instanceof Error
        ? err.message
        : err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : String(err);
    console.warn('[storage] migration skipped:', detail || 'unknown error');
  });
  initProfileState().catch((err) => console.error('[profileState] init failed:', err));
  initDesktopState().catch((err) => console.error('[desktopState] init failed:', err));

  // Dev-only: prove the Japanese tokenizer actually builds in the renderer (its
  // result is mirrored to the terminal via the main-process console forwarder).
  // Pre-warm the Japanese tokenizer at startup so word highlighting and click
  // lookup are instant when a reader opens.
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

  installKeyboardShortcuts();
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
  // Re-apply after mount so compensated size is correct once #root is live.
  applyZoom(loadZoom());
}
