import { app, BrowserWindow, protocol, net, shell, ipcMain, dialog, globalShortcut, session, type OpenDialogOptions } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import started from 'electron-squirrel-startup';
import { registerLibraryIpc, registerLocalFileProtocol, ensureLibrary, libraryRoot, listLibraryItems, onLibraryItemsAdded } from './main/library';
import { registerReadingListsIpc } from './main/readingListsIpc';
import { registerReadingListsLateBinding } from './main/readingListsBinding';
import { registerReadingRemindersIpc } from './main/readingListsReminders';
import { registerDictionaryIpc, initYomitan } from './main/dictionary';
import { registerMediaIpc } from './main/media';
import { registerYtPlaylistsIpc } from './main/ytPlaylists';
import { registerProfileIpc } from './main/profiles';
import { registerAnkiIpc } from './main/anki';
import { registerProfileRulesIpc } from './main/profileRules';
import { registerApkgIpc } from './main/anki/apkgImport';
import { registerAnkiAiAdditionsIpc } from './main/anki/aiAdditions';
import { registerDesktopIpc } from './main/desktop';
import { registerDisplayIpc } from './main/displays';
import {
  closeAllDesktopWindows,
  configureDesktopWindows,
  registerDesktopWindowsIpc,
  syncDesktopWindows,
} from './main/desktopWindows';
import {
  closeAllStudyBlockWindows,
  configureStudyBlockWindows,
  registerStudyBlockWindowIpc,
} from './main/studyBlockWindows';
import { registerDeskDragIpc } from './main/deskDrag';
import { registerFileRouterIpc } from './main/fileRouter';
import { registerFilesAppIpc } from './main/filesApp/ipc';
import { registerTranslateIpc } from './main/translate';
import { registerTranslateAnalysisIpc } from './main/translateAnalysis';
import { registerSentenceAnalysisIpc } from './main/sentenceAnalysis';
import { registerVideoClipIpc } from './main/videoClip';
import { registerMediaStudyAssistantIpc } from './main/mediaStudyAssistant';
import { registerMediaStudyOrchestratorIpc } from './main/mediaStudyOrchestrator';
import { registerLocalAgentIpc, stopLocalAgentRuntime } from './main/localAgent';
import { setAgentNavigationOpener } from './main/agentNavigationIpc';
import { registerLocalAgentSchedulerIpc, stopLocalAgentScheduler } from './main/localAgentScheduler';
import { registerMiningIpc } from './main/mining';
import { registerImmersionIpc } from './main/immersion';
import { registerSystemMetricsIpc } from './main/systemMetrics';
import { registerScraperIpc } from './main/scraper';
import { registerReadingIpc } from './main/reading';
import { registerSeanimeIpc, stopSeanime } from './main/seanime';
import { registerMalSyncIpc } from './main/malSync';
import { registerMalLibraryIpc } from './main/malLibrary';
import { registerReleaseIpc } from './main/release';
import { registerResourcesCatalogIpc } from './main/resourcesCatalog';
import { registerCollectedToolsIpc } from './main/collectedTools';
import { registerStatsIpc } from './main/stats';
import { registerJitenIpc } from './main/jiten';
import { registerCredentialIpc } from './main/credentials/ipc';
import { initDownloads, registerDownloadIpc } from './main/downloads';
import { registerMangaOcrIpc } from './main/mangaOcr';
import { registerBookOcrIpc } from './main/bookOcrJob';
import { registerMainI18nIpc } from './main/i18n';
import { startDebugBridge, stopDebugBridge, recordDebugLog } from './main/debugBridge';
import { stopLlamaHost } from './main/llamaHost';
import {
  registerExtensionBridgeIpc,
  startExtensionServer,
  stopExtensionServer,
} from './main/extensionServer';
import {
  loadWindowChromePrefs,
  mainWindowOptions,
  registerWindowChromeIpc,
} from './main/windowChrome';
import { contentSecurityPolicyHeader } from './shared/contentSecurityPolicy';
import { buildImmersionGuestPreload } from './shared/immersionGuestBridge';
import type { PlayerCommand, PlayerSnapshot } from './shared/playerSync';
import { livePlayerWindowIds, releasePlayerLeadership } from './shared/playerSync';
import type { AgentNavigationDestination } from './shared/agentNavigation';
import { LEGACY_WIN_SECTION_ALIASES } from './shared/desktop';
import {
  AGENT_NAVIGATION_CHANNELS,
  AGENT_SETTINGS_DELIVERY_ATTEMPT_MS,
  AGENT_SETTINGS_DELIVERY_BUDGET_MS,
  agentSettingsDeliveryDecision,
  type AgentSettingsDeliveryOutcome,
} from './shared/agentNavigationBridge';
import {
  automationBuilderDirectCommand,
  type AutomationBuilderLaunchResult,
} from './shared/automationBuilder';
import {
  sanitizeToolboxFileSearchRequest,
  type ToolboxFileSearchRequest,
  type ToolboxFileSearchResponse,
  type ToolboxFileSearchResult,
} from './shared/toolboxFileSearch';
import {
  configureCompanionHost,
  registerCompanionHostIpc,
  closeCompanionHost,
} from './main/companionHost';
import { registerBuddySchedulerIpc, stopBuddyScheduler } from './main/buddyScheduler';
import {
  configureSystemDictionary,
  registerSystemDictionaryIpc,
  startSystemDictionary,
  stopSystemDictionary,
} from './main/systemDictionary';
import {
  configureReadingLens,
  registerReadingLensIpc,
  startReadingLens,
  stopReadingLens,
} from './main/readingLens';
import {
  isOsHotkeyHelperInstalled,
  registerOsHotkeyHelperIpc,
} from './main/osHotkeyHelper';
import { registerLiveCaptionsIpc } from './main/liveCaptions';
import { registerFlashcardAudioIpc } from './main/flashcardAudio';
import { logDiagnostic, errorDetail } from './main/errorLog';
import { resolveAppAsset } from './main/appProtocolResolve';

if (started) {
  app.quit();
}

// A dev-only, opt-in userData redirect, so a second instance can be driven while
// another one holds the machine.
//
// This MUST run before requestSingleInstanceLock() below: Electron keys that lock on
// the userData path, so without the redirect a second copy loses the lock, calls
// app.quit(), and routes its argv into the FIRST app — which reads as "my instance
// never started" and is not that at all.
//
// It is deliberately an env var rather than the `--user-data-dir` Chromium switch.
// Position-dependent switch parsing through `electron-forge start -- …` is not
// something to be uncertain about here: the failure mode is two live instances on ONE
// profile, and %APPDATA%\jp-study-app is 8.6 GB of leveldb/SQLite with no restore
// point. An env var either took effect or it did not, and the value is echoed to the
// log below so a driver can confirm which before any data is touched.
//
// Never in a packaged build, so a shipped app cannot be pointed at a scratch profile
// by a stray environment variable.
const altUserData = !app.isPackaged ? (process.env.JP_USER_DATA_DIR ?? '').trim() : '';
if (altUserData) {
  app.setPath('userData', path.resolve(altUserData));
  app.setPath('sessionData', path.resolve(altUserData));
  console.log(`[main] JP_USER_DATA_DIR -> userData = ${app.getPath('userData')}`);
}

// Single instance so a Startup hotkey can launch with `--toggle` / `--open=` /
// `--restart` and route into the already-running copy.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

/** Set once window wiring is ready — second-instance / IPC call these. */
let toggleAppVisibilityHandler: (() => void) | null = null;
let focusAppHandler: (() => void) | null = null;
let openSectionHandler: ((section: string) => void) | null = null;
let pendingOpenSection: string | null = null;

/** Pop-out sections allowed on `--open=` / `--popout=` (mirrors createPopoutWindow). */
const ARGV_OPEN_SECTIONS = new Set([
  'library', 'novels', 'reading', 'dictionary', 'grammar', 'translate', 'player', 'video', 'music',
  'anki', 'flashcards', 'games', 'stats', 'resources', 'city', 'musicwidget', 'immersion',
  'calendar', 'settings', 'youtube', 'scraper', 'files',
]);

export function argvWantsToggle(argv: string[] = process.argv): boolean {
  return argv.some((a) => a === '--toggle' || a === '--grammarx-toggle');
}

export function argvWantsRestart(argv: string[] = process.argv): boolean {
  return argv.some((a) => a === '--restart' || a === '--grammarx-restart');
}

export function argvOpenSection(argv: string[] = process.argv): string | null {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    let raw: string | null = null;
    if (a.startsWith('--open=')) raw = a.slice('--open='.length);
    else if (a.startsWith('--popout=')) raw = a.slice('--popout='.length);
    else if ((a === '--open' || a === '--popout') && argv[i + 1]) raw = argv[++i]!;
    if (raw == null) continue;
    const requested = raw.trim().toLowerCase();
    // A shortcut pinned before gate 7b still carries `--open=notebook`. The
    // alias table points it at the Files app that absorbed the section, so it
    // opens the user's material instead of silently doing nothing.
    const section = LEGACY_WIN_SECTION_ALIASES[requested] ?? requested;
    if (ARGV_OPEN_SECTIONS.has(section)) return section;
  }
  return null;
}

function queueOrOpenSection(section: string): void {
  if (openSectionHandler) openSectionHandler(section);
  else pendingOpenSection = section;
}

app.on('second-instance', (_event, argv) => {
  if (argvWantsRestart(argv)) {
    app.relaunch();
    app.exit(0);
    return;
  }
  if (argvWantsToggle(argv)) {
    toggleAppVisibilityHandler?.();
    return;
  }
  const section = argvOpenSection(argv);
  if (section) {
    queueOrOpenSection(section);
    return;
  }
  focusAppHandler?.();
});

function isEpipe(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && 'code' in err && (err as { code?: unknown }).code === 'EPIPE');
}

process.stdout?.on?.('error', (err) => {
  if (!isEpipe(err)) throw err;
});
process.stderr?.on?.('error', (err) => {
  if (!isEpipe(err)) throw err;
});
process.on('uncaughtException', (err) => {
  if (isEpipe(err)) return;
  console.error(err);
  logDiagnostic('error', 'main', 'uncaughtException', errorDetail(err));
  app.quit();
});
// Previously unhandled promise rejections in the main process were silent
// (Node's default is a console warning at best) — log them so they're
// diagnosable without a dev console attached (PHASE_6_5_AUDIT.md Phase 8 gap).
process.on('unhandledRejection', (reason) => {
  logDiagnostic('error', 'main', 'unhandledRejection', errorDetail(reason));
});

if (typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined' && MAIN_WINDOW_VITE_DEV_SERVER_URL) {
  app.commandLine.appendSwitch('disable-http-cache');
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true },
  },
  {
    scheme: 'media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true },
  },
  {
    scheme: 'playfile',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true },
  },
  // Wallpaper / library images — stream from disk (never base64 into the renderer).
  {
    scheme: 'localfile',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
      corsEnabled: true,
    },
  },
]);

/**
 * Missing-asset paths already reported, so one broken bundle logs each path
 * once rather than once per request. Capped because the key is attacker-shaped
 * (any renderer navigation can mint a new `app://` path) and this set is
 * process-lifetime.
 */
const reportedMissingAssets = new Set<string>();
const MISSING_ASSET_LOG_LIMIT = 200;

function registerAppProtocol(): void {
  const rendererRoot = path.resolve(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}`);
  const publicRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'public')
    : path.join(app.getAppPath(), 'public');

  protocol.handle('app', (request) => {
    try {
      const url = new URL(request.url);
      const decision = resolveAppAsset(
        { rendererRoot, publicRoot },
        decodeURIComponent(url.pathname),
        (candidate) => fs.existsSync(candidate),
      );

      if (decision.kind === 'forbidden') return new Response('Forbidden', { status: 403 });
      if (decision.kind === 'missing') {
        // Handing a known-missing path to `net.fetch` rejects with a bare
        // `net::ERR_FILE_NOT_FOUND` whose stack names neither the URL nor the
        // path, so a production boot missing a gitignored bundle — measured
        // 2026-09-01: 12 identical anonymous stacks, all of them
        // `/kuromoji/dict/*.dat.bin` — is undiagnosable from the log alone.
        // Answer 404 ourselves and say which asset, once per path.
        if (
          !reportedMissingAssets.has(decision.rel)
          && reportedMissingAssets.size < MISSING_ASSET_LOG_LIMIT
        ) {
          reportedMissingAssets.add(decision.rel);
          logDiagnostic('warn', 'app-protocol', 'missing-bundled-asset', decision.rel);
        }
        return new Response('Not found', { status: 404 });
      }
      return net.fetch(pathToFileURL(decision.path).toString());
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function registerMediaProtocol(): void {
  const root = path.resolve(libraryRoot());
  protocol.handle('media', (request) => {
    try {
      const url = new URL(request.url);
      const rel = decodeURIComponent(url.host + url.pathname);
      const resolved = path.resolve(root, rel);
      if (resolved !== root && !resolved.startsWith(root + path.sep)) {
        return new Response('Forbidden', { status: 403 });
      }
      return net.fetch(pathToFileURL(resolved).toString());
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

// Content-Security-Policy for the packaged app's own document
// (app://bundle/index.html and any same-origin app:// sub-resources it loads).
// Only registered when the app:// protocol itself is registered (production —
// see the app.whenReady() call site), so this never touches the Vite dev
// server origin, which needs eval/HMR websockets the CSP below would block.
// media:/playfile:/localfile: are registered with bypassCSP: true (see
// registerSchemesAsPrivileged above), so resources referenced from those
// schemes keep loading regardless of what's listed here — this CSP's real
// job is blocking a compromised renderer from loading/exfiltrating to an
// arbitrary https:// host (PHASE_6_5_AUDIT.md §3, chained High finding).
function registerContentSecurityPolicy(): void {
  // The policy itself lives in `shared/contentSecurityPolicy.ts` so it can be read by a test.
  // It is a load-bearing control (PHASE_6_5_AUDIT.md §3) and was previously an inline string
  // inside this function, which no test could reach.
  const csp = contentSecurityPolicyHeader();

  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ['app://*/*'] },
    (details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [csp],
        },
      });
    },
  );
}

function registerDiagnosticsIpc(): void {
  ipcMain.handle('diagnostics:logRendererError', (_e, payload: { subsystem?: string; operation?: string; detail?: string }) => {
    logDiagnostic(
      'error',
      typeof payload?.subsystem === 'string' ? payload.subsystem.slice(0, 64) : 'renderer',
      typeof payload?.operation === 'string' ? payload.operation.slice(0, 128) : 'error',
      typeof payload?.detail === 'string' ? payload.detail : '',
    );
  });
}

function registerShellIpc(): void {
  ipcMain.handle('shell:openExternal', async (_e, url: unknown): Promise<boolean> => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      await shell.openExternal(url);
      return true;
    }
    return false;
  });
}

function registerAppLifecycleIpc(): void {
  ipcMain.handle('app:relaunch', (): { ok: boolean } => {
    app.relaunch();
    app.exit(0);
    return { ok: true };
  });
}

// Folders the user has actually picked via toolbox:pickSearchFolder this
// session. toolbox:fileSearch only accepts a root that is one of these (or a
// subdirectory of one), since the file-search UI has no free-text root input.
const lastPickedSearchRoots = new Set<string>();

function isAllowedSearchRoot(resolvedRoot: string): boolean {
  for (const picked of lastPickedSearchRoots) {
    if (resolvedRoot === picked || resolvedRoot.startsWith(picked + path.sep)) return true;
  }
  return false;
}

/**
 * Where `automation-builder.ps1` actually is on this machine, or null.
 *
 * Shared by the launcher and the command readout so the two cannot disagree.
 * The readout used to render a constant containing a developer's own home
 * directory (audit F9) — a path that is wrong for every other install, yet was
 * offered for copying to the clipboard as if it would work.
 */
function resolveAutomationBuilderScript(): string | null {
  const candidates = [
    path.join(app.getAppPath(), 'automation-builder.ps1'),
    path.join(process.cwd(), 'automation-builder.ps1'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function registerToolboxIpc(): void {
  ipcMain.handle(
    'toolbox:automationBuilderCommand',
    (): string | null => {
      const scriptPath = resolveAutomationBuilderScript();
      return scriptPath ? automationBuilderDirectCommand(scriptPath) : null;
    },
  );

  ipcMain.handle('toolbox:launchAutomationBuilder', (): AutomationBuilderLaunchResult => {
    const scriptPath = resolveAutomationBuilderScript();
    if (!scriptPath) {
      return { ok: false, error: 'automation-builder.ps1 was not found in the app root.' };
    }

    try {
      const child = spawn(
        'powershell.exe',
        ['-ExecutionPolicy', 'Bypass', '-File', scriptPath],
        {
          cwd: path.dirname(scriptPath),
          detached: true,
          stdio: 'ignore',
          windowsHide: false,
        },
      );
      child.unref();
      return { ok: true, pid: child.pid, scriptPath };
    } catch (err) {
      return {
        ok: false,
        scriptPath,
        error: err instanceof Error ? err.message : 'Failed to launch Automation Builder.',
      };
    }
  });

  ipcMain.handle('toolbox:pickSearchFolder', async (): Promise<string | null> => {
    const options: OpenDialogOptions = {
      title: 'Choose a folder to search',
      properties: ['openDirectory'],
    };
    const result =
      mainWindow && !mainWindow.isDestroyed()
        ? await dialog.showOpenDialog(mainWindow, options)
        : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return null;
    const picked = path.resolve(result.filePaths[0]);
    // The renderer's FileSearchPanel only ever gets `root` from this picker
    // result (there's no free-text root input) — remember it so
    // toolbox:fileSearch can reject a root that didn't come from here
    // (PHASE_6_5_AUDIT.md §3 Medium finding: a compromised renderer could
    // otherwise call fileSearch directly with an arbitrary root to
    // enumerate any folder on disk).
    lastPickedSearchRoots.add(picked);
    return picked;
  });

  ipcMain.handle(
    'toolbox:fileSearch',
    async (_event, input: ToolboxFileSearchRequest): Promise<ToolboxFileSearchResponse> => {
      const request = sanitizeToolboxFileSearchRequest(input);
      const root = path.resolve(request.root);
      const needle = request.query.toLowerCase();
      if (!needle) return { ok: false, error: 'Enter a search term.' };
      if (!isAllowedSearchRoot(root)) {
        return {
          ok: false,
          root,
          error: 'Choose a folder with "Browse" before searching.',
        };
      }

      try {
        const stat = await fs.promises.stat(root);
        if (!stat.isDirectory()) return { ok: false, root, error: 'Search root is not a folder.' };
      } catch (error) {
        return {
          ok: false,
          root,
          error: error instanceof Error ? error.message : 'Search root is unavailable.',
        };
      }

      const extensionSet = new Set(request.extensions);
      const results: ToolboxFileSearchResult[] = [];
      const stack = [root];
      let scanned = 0;
      let truncated = false;

      while (stack.length > 0) {
        if (scanned >= request.maxScanned! || results.length >= request.maxResults!) {
          truncated = true;
          break;
        }
        const current = stack.pop()!;
        let entries: fs.Dirent[];
        try {
          entries = await fs.promises.readdir(current, { withFileTypes: true });
        } catch {
          continue;
        }

        for (const entry of entries) {
          if (scanned >= request.maxScanned! || results.length >= request.maxResults!) {
            truncated = true;
            break;
          }
          if (entry.isSymbolicLink()) continue;

          const fullPath = path.join(current, entry.name);
          const isDirectory = entry.isDirectory();
          const ext = isDirectory ? '' : path.extname(entry.name).slice(1).toLowerCase();

          if (isDirectory) {
            stack.push(fullPath);
          } else {
            scanned += 1;
          }

          if (
            entry.name.toLowerCase().includes(needle) &&
            (isDirectory || extensionSet.size === 0 || extensionSet.has(ext))
          ) {
            try {
              const itemStat = await fs.promises.stat(fullPath);
              results.push({
                name: entry.name,
                path: fullPath,
                ext,
                size: itemStat.size,
                modifiedMs: itemStat.mtimeMs,
                isDirectory,
              });
            } catch {
              /* skip entries that vanish during search */
            }
          }
        }
      }

      results.sort((a, b) => Number(a.isDirectory) - Number(b.isDirectory) || a.name.localeCompare(b.name));
      return { ok: true, root, results, scanned, truncated };
    },
  );
}

function isDevServer(): boolean {
  return typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined' && !!MAIN_WINDOW_VITE_DEV_SERVER_URL;
}

// The page every window loads. In dev it's the Vite server, in prod the bundled
// index.html served over the app:// protocol. An optional query string (e.g.
// `popout=dictionary`) is appended so a window can tell the renderer to show a
// single app instead of the whole desktop.
function rendererUrl(query = ''): string {
  const base = isDevServer() ? MAIN_WINDOW_VITE_DEV_SERVER_URL : 'app://bundle/index.html';
  if (!query) return base;
  return `${base}${base.includes('?') ? '&' : '?'}${query}`;
}

/**
 * The Blanc Toolbox window has its own HTML entry so it never boots the Study OS
 * bundle (BLANC_REFINEMENT_PLAN.md Pillar 1). Keeps `blanc=1` on the query
 * string: `isBlancWindow()` reads it, and several renderer modules branch on it.
 */
function blancUrl(): string {
  const base = isDevServer()
    ? `${MAIN_WINDOW_VITE_DEV_SERVER_URL.replace(/\/$/, '')}/blanc.html`
    : 'app://bundle/blanc.html';
  return `${base}?blanc=1`;
}

// Mirror the renderer's console to our terminal (dev only). Registered per
// window so pop-out windows report errors too.
function forwardRendererConsole(win: BrowserWindow): void {
  win.webContents.on('console-message', (...args: unknown[]) => {
    const details = args.find(
      (a) => a && typeof a === 'object' && 'message' in (a as Record<string, unknown>),
    ) as { message?: string } | undefined;
    const message = details?.message ?? (typeof args[2] === 'string' ? args[2] : '');
    if (message) {
      console.log(`[renderer] ${message}`);
      // Tee to the debug bridge so the line survives the process that printed it.
      recordDebugLog(`renderer:${win.id}`, 'log', message);
    }
  });
}

/** Primary Study OS window (full desktop). Kept so Mini Widget can hide/show it. */
let mainWindow: BrowserWindow | null = null;
/** Floating Mini craft widget — frameless, transparent, always-on-top. */
let miniWidgetWindow: BrowserWindow | null = null;
/** Compact Blanc Toolbox side window — parallel to the full Study OS. */
let blancWindow: BrowserWindow | null = null;
/** Compact PIN lock widget — frameless, transparent, no OS shadow. */
let lockscreenWindow: BrowserWindow | null = null;
let lockscreenDismissedViaUnlock = false;

const BLANC_DEFAULT_W = 720;
const BLANC_DEFAULT_H = 560;
const BLANC_MIN_W = 380;
const BLANC_MIN_H = 340;
// No hard max: Blanc must maximize and go fullscreen to fill any monitor, and
// stay laid out from a tiny window to an ultrawide. The layout is fully fluid,
// so the window size is the user's to choose.
const BLANC_MAX_W = 100000;
const BLANC_MAX_H = 100000;

const MINI_DEFAULT_W = 360;
const MINI_DEFAULT_H = 440;
const MINI_MIN_W = 260;
const MINI_MIN_H = 320;
const MINI_MAX_W = 560;
const MINI_MAX_H = 720;

/**
 * Immersion Browser guest preload (slice 70) — materialised to userData.
 *
 * The guest study bridge has to exist as a standalone file on disk, because
 * that is the only thing a `<webview>` preload can be. Adding a build entry for
 * it would mean editing `forge.config.ts` / `vite.*.config.ts`, which are
 * off-limits; instead the source is generated from the type-checked, tested
 * `immersionGuestBody` in `src/shared/immersionGuestBridge.ts` and written once
 * per launch. Rewriting every launch is deliberate: an app update must not
 * leave a stale bridge behind.
 */
let immersionGuestPreloadPath: string | null = null;
function ensureImmersionGuestPreload(): string | null {
  if (immersionGuestPreloadPath) return immersionGuestPreloadPath;
  try {
    const file = path.join(app.getPath('userData'), 'immersion-guest-preload.js');
    fs.writeFileSync(file, buildImmersionGuestPreload(), 'utf8');
    immersionGuestPreloadPath = file;
    return file;
  } catch (err) {
    logDiagnostic('error', 'immersion', 'guest-preload-write-failed', String(err));
    return null;
  }
}

function attachNavGuards(win: BrowserWindow): void {
  // Immersion Browser <webview> guests are arbitrary untrusted web content.
  // The renderer builds the tag (`ImmersionContent.createWebview`), but the
  // privilege decision is made HERE, in main, where a compromised renderer
  // cannot reach it. Every unsafe preference is forced off on every attach, and
  // the only preload a guest can ever receive is our study bridge — which can
  // talk to the embedder element and to nothing else (no ipcMain, so no
  // dictionary IPC). Before this, nothing enforced the defaults `main.ts:596`
  // relies on: any future edit adding `nodeintegration` or
  // `webpreferences="contextIsolation=no"` to the tag would have been honoured.
  win.webContents.on('will-attach-webview', (_event, webPreferences, params) => {
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.nodeIntegrationInWorker = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.allowRunningInsecureContent = false;
    webPreferences.experimentalFeatures = false;

    // Renderer-supplied privilege attributes are dropped, not merged.
    delete params.nodeintegration;
    delete params.nodeintegrationinsubframes;
    delete params.disablewebsecurity;
    delete params.webpreferences;

    const bridge = ensureImmersionGuestPreload();
    const prefs = webPreferences as { preload?: string; preloadURL?: string };
    if (bridge) {
      prefs.preload = bridge;
      prefs.preloadURL = pathToFileURL(bridge).toString();
    } else {
      delete prefs.preload;
      delete prefs.preloadURL;
    }
  });

  // Accidental <a href="https://…"> clicks must never replace the SPA shell.
  const allowAppNav = (url: string): boolean => {
    if (!url || url === 'about:blank') return true;
    if (url.startsWith('devtools://') || url.startsWith('chrome-devtools://')) return true;
    if (url.startsWith('app://')) return true;
    if (isDevServer() && url.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL)) return true;
    if (url.startsWith('file://') && url.includes('index.html')) return true;
    return false;
  };
  win.webContents.on('will-navigate', (e, url) => {
    if (!allowAppNav(url)) {
      e.preventDefault();
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  // Every window goes through attachNavGuards, so this is one place to catch
  // renderer crashes/hangs for all six window types (previously unmonitored —
  // PHASE_6_5_AUDIT.md Phase 8 gap: a renderer crash just left a blank/frozen
  // window with no log trail).
  win.webContents.on('render-process-gone', (_e, details) => {
    logDiagnostic('error', 'renderer', 'render-process-gone', `reason=${details.reason}`);
  });
  win.on('unresponsive', () => {
    logDiagnostic('warn', 'renderer', 'unresponsive', win.getTitle());
  });
}

const createWindow = (restore?: {
  bounds?: { x: number; y: number; width: number; height: number };
  maximized?: boolean;
  visible?: boolean;
}): void => {
  const chrome = loadWindowChromePrefs();
  mainWindow = new BrowserWindow({
    width: restore?.bounds?.width ?? 1280,
    height: restore?.bounds?.height ?? 860,
    x: restore?.bounds?.x,
    y: restore?.bounds?.y,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#1b1b21',
    autoHideMenuBar: true,
    // Deferred show + ready-to-show, matching every other window in this file
    // (Blanc/Mini/Lockscreen/pop-out) — the main window was the only one that
    // showed immediately on construction instead of waiting for first paint,
    // which is the standard Electron cause of a window staying blank on some
    // GPU/compositor setups (nothing to swap in yet when it's first shown).
    show: false,
    ...mainWindowOptions(chrome),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Immersion Browser guest pages (<webview>) — isolated from window.api.
      webviewTag: true,
    },
  });

  if (restore?.maximized) mainWindow.maximize();
  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed() && restore?.visible !== false) {
      mainWindow.show();
    }
  });

  // Companion host is skipTaskbar; tear it down when the real main window closes
  // so the app can quit instead of leaving invisible pets running.
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (miniWidgetWindow && !miniWidgetWindow.isDestroyed()) {
      miniWidgetWindow.close();
    }
    if (lockscreenWindow && !lockscreenWindow.isDestroyed()) {
      lockscreenWindow.close();
    }
    closeCompanionHost();
    // Secondary desktops are layered on the main window, not peers of it —
    // they must never keep the app alive on their own (B5).
    closeAllDesktopWindows();
    // A detached block is a panel of the player, not a peer of the app — it must not
    // survive the window that was feeding it, or it sits there showing a dead episode.
    closeAllStudyBlockWindows();
    stopBuddyScheduler();
  });

  attachNavGuards(mainWindow);

  if (isDevServer()) {
    mainWindow.webContents.session.clearCache().finally(() => mainWindow!.loadURL(rendererUrl()));
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    forwardRendererConsole(mainWindow);
  } else {
    mainWindow.loadURL(rendererUrl());
  }
};

function recreateMainWindow(): void {
  const old = mainWindow;
  if (!old || old.isDestroyed()) {
    createWindow();
    return;
  }
  const restore = {
    bounds: old.getBounds(),
    maximized: old.isMaximized(),
    visible: old.isVisible(),
  };
  old.removeAllListeners('closed');
  old.once('closed', () => {
    createWindow(restore);
  });
  old.close();
}

/**
 * Blanc Toolbox runs beside the full Study OS. It is intentionally much smaller
 * than the main desktop window and never hides or relaunches the main shell.
 */
function blancBoundsFile(): string {
  return path.join(app.getPath('userData'), 'blanc-window.json');
}

/** Last Blanc window size, saved on close. Applied only when the caller passes
 *  no explicit size (the renderer omits it when rememberWindowBounds is on). */
function readSavedBlancSize(): { width: number; height: number } | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(blancBoundsFile(), 'utf8')) as {
      width?: unknown;
      height?: unknown;
    };
    if (typeof parsed.width !== 'number' || typeof parsed.height !== 'number') return null;
    return { width: parsed.width, height: parsed.height };
  } catch {
    return null;
  }
}

function saveBlancSize(win: BrowserWindow): void {
  try {
    const { width, height } = win.getBounds();
    fs.writeFileSync(blancBoundsFile(), JSON.stringify({ width, height }));
  } catch {
    /* best effort; the default size is always safe */
  }
}

function createBlancWindow(size?: { width?: number; height?: number }): void {
  const saved = size ? null : readSavedBlancSize();
  const width = Math.min(
    BLANC_MAX_W,
    Math.max(BLANC_MIN_W, Math.round(size?.width ?? saved?.width ?? BLANC_DEFAULT_W)),
  );
  const height = Math.min(
    BLANC_MAX_H,
    Math.max(BLANC_MIN_H, Math.round(size?.height ?? saved?.height ?? BLANC_DEFAULT_H)),
  );

  if (blancWindow && !blancWindow.isDestroyed()) {
    blancWindow.setSize(width, height);
    if (blancWindow.isMinimized()) blancWindow.restore();
    blancWindow.show();
    blancWindow.focus();
    return;
  }

  blancWindow = new BrowserWindow({
    width,
    height,
    minWidth: BLANC_MIN_W,
    minHeight: BLANC_MIN_H,
    // No maxWidth/maxHeight: the window may fill any monitor. The layout is
    // fluid, so maximize and fullscreen both stay usable.
    frame: true,
    resizable: true,
    maximizable: true,
    fullscreenable: true,
    skipTaskbar: false,
    title: 'Blanc Toolbox',
    backgroundColor: '#1c1c1e',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // BlancShell never mounts ImmersionView (the only <webview> consumer) — no
      // guest-page capability needed here.
      backgroundThrottling: false,
    },
  });

  const win = blancWindow;
  attachNavGuards(win);
  if (isDevServer()) forwardRendererConsole(win);

  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.show();
  });
  win.on('close', () => {
    if (!win.isDestroyed()) saveBlancSize(win);
  });
  win.on('closed', () => {
    blancWindow = null;
  });

  void win.loadURL(blancUrl());
}

function closeBlancWindow(): void {
  if (blancWindow && !blancWindow.isDestroyed()) {
    blancWindow.close();
  }
  blancWindow = null;
}

function registerBlancIpc(): void {
  ipcMain.handle(
    'blanc:open',
    (_e, size?: { width?: number; height?: number }): { ok: boolean } => {
      createBlancWindow(size);
      return { ok: true };
    },
  );
  ipcMain.handle('blanc:close', (): { ok: boolean } => {
    closeBlancWindow();
    return { ok: true };
  });
  ipcMain.handle('blanc:isOpen', (): boolean =>
    Boolean(blancWindow && !blancWindow.isDestroyed()),
  );
  ipcMain.handle('blanc:setFullScreen', (event, on: unknown): { ok: boolean } => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win !== blancWindow || win.isDestroyed()) return { ok: false };
    win.setFullScreen(on === true);
    return { ok: true };
  });

  // OS-level global shortcut for `toolbox.open`. The renderer pushes the user's
  // current binding here on boot and on every rebind, so the registry's
  // `global: true` claim is real, not in-app-only. Registration can fail when
  // another application owns the accelerator; the in-app binding still works.
  let blancGlobalAccelerator: string | null = null;
  ipcMain.handle('blanc:setGlobalShortcut', (_event, chord: unknown): { ok: boolean; error?: string } => {
    if (blancGlobalAccelerator) {
      try {
        globalShortcut.unregister(blancGlobalAccelerator);
      } catch {
        /* already gone */
      }
      blancGlobalAccelerator = null;
    }
    if (typeof chord !== 'string' || !chord.trim()) return { ok: true };
    // The chord format is "Ctrl+Alt+B" (alternatives split by "|"); register the
    // first alternative only. Electron uses "Super" where the app says "Meta".
    const accelerator = chord.split('|')[0]!.trim().replace(/\bMeta\b/g, 'Super');
    if (!/^([\w]+\+)+[\w,.;'[\]/\\`=-]+$/.test(accelerator)) {
      return { ok: false, error: 'This shortcut cannot be registered system-wide.' };
    }
    if (!/(Ctrl|Alt|Shift|Super|CmdOrCtrl)\+/i.test(accelerator)) {
      return { ok: false, error: 'Global shortcuts need at least one modifier key.' };
    }
    try {
      const registered = globalShortcut.register(accelerator, () => createBlancWindow());
      if (!registered) {
        return { ok: false, error: `"${accelerator}" is already in use by another application.` };
      }
      blancGlobalAccelerator = accelerator;
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Could not register the global shortcut.' };
    }
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });

  // Hide / show GrammarX. When the Windows Startup helper is installed it owns
  // the OS accelerators (so hotkeys work even after a full quit) and we must
  // not also RegisterHotKey here — two owners fight over the same chord.
  let appToggleAccelerator: string | null = null;
  let appRestartAccelerator: string | null = null;
  function toggleAppVisibility(): void {
    const mainAlive = Boolean(mainWindow && !mainWindow.isDestroyed());
    const mainShowing =
      mainAlive && mainWindow!.isVisible() && !mainWindow!.isMinimized();
    if (mainShowing) {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed() && win.isVisible()) win.hide();
      }
      return;
    }
    if (!mainAlive) recreateMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
  function focusApp(): void {
    if (!mainWindow || mainWindow.isDestroyed()) recreateMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
  function fullyRestartApp(): void {
    app.relaunch();
    app.exit(0);
  }
  toggleAppVisibilityHandler = toggleAppVisibility;
  focusAppHandler = focusApp;

  function parseGlobalAccelerator(chord: unknown): { ok: true; accelerator: string } | { ok: false; error: string } {
    if (typeof chord !== 'string' || !chord.trim()) {
      return { ok: true, accelerator: '' };
    }
    const accelerator = chord.split('|')[0]!.trim().replace(/\bMeta\b/g, 'Super');
    if (!/^([\w]+\+)+[\w,.;'[\]/\\`=-]+$/.test(accelerator)) {
      return { ok: false, error: 'This shortcut cannot be registered system-wide.' };
    }
    if (!/(Ctrl|Alt|Shift|Super|CmdOrCtrl)\+/i.test(accelerator)) {
      return { ok: false, error: 'Global shortcuts need at least one modifier key.' };
    }
    return { ok: true, accelerator };
  }

  ipcMain.handle('app:toggle', (): { ok: boolean } => {
    toggleAppVisibility();
    return { ok: true };
  });
  ipcMain.handle('app:setToggleShortcut', (_event, chord: unknown): { ok: boolean; error?: string } => {
    if (appToggleAccelerator) {
      try {
        globalShortcut.unregister(appToggleAccelerator);
      } catch {
        /* already gone */
      }
      appToggleAccelerator = null;
    }
    const parsed = parseGlobalAccelerator(chord);
    if (!parsed.ok) return parsed;
    if (!parsed.accelerator) return { ok: true };
    // Startup helper owns OS registration when installed — renderer syncs chords there.
    if (isOsHotkeyHelperInstalled()) return { ok: true };
    try {
      const registered = globalShortcut.register(parsed.accelerator, () => toggleAppVisibility());
      if (!registered) {
        return { ok: false, error: `"${parsed.accelerator}" is already in use by another application.` };
      }
      appToggleAccelerator = parsed.accelerator;
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Could not register the global shortcut.',
      };
    }
  });
  ipcMain.handle('app:setRestartShortcut', (_event, chord: unknown): { ok: boolean; error?: string } => {
    if (appRestartAccelerator) {
      try {
        globalShortcut.unregister(appRestartAccelerator);
      } catch {
        /* already gone */
      }
      appRestartAccelerator = null;
    }
    const parsed = parseGlobalAccelerator(chord);
    if (!parsed.ok) return parsed;
    if (!parsed.accelerator) return { ok: true };
    if (isOsHotkeyHelperInstalled()) return { ok: true };
    try {
      const registered = globalShortcut.register(parsed.accelerator, () => fullyRestartApp());
      if (!registered) {
        return { ok: false, error: `"${parsed.accelerator}" is already in use by another application.` };
      }
      appRestartAccelerator = parsed.accelerator;
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Could not register the global shortcut.',
      };
    }
  });

  registerOsHotkeyHelperIpc();

  // Live Captions capture resumes itself here when the user left it enabled —
  // the source window is lossy, so capture has to be running before the user
  // thinks to open the notebook.
  registerLiveCaptionsIpc(() => mainWindow);

  // Blanc cannot serve Settings-only extension deep-links; focus the main Study
  // OS window and forward the original target there (not broadcast to all
  // windows — that would re-enter Blanc's handler and loop).
  ipcMain.handle(
    'extension:focus-main-and-open',
    (_event, target: unknown): { ok: boolean } => {
      const t = String(target || '').trim().toLowerCase();
      if (!t) return { ok: false };
      if (!mainWindow || mainWindow.isDestroyed()) recreateMainWindow();
      if (!mainWindow || mainWindow.isDestroyed()) return { ok: false };
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('extension:ui-open', { target: t });
      return { ok: true };
    },
  );
}

/**
 * True Mini Widget Mode: a small borderless transparent always-on-top window
 * that only wraps the craft panel (no full-screen black canvas).
 */
function createMiniWidgetWindow(size?: { width?: number; height?: number }): void {
  const width = Math.min(
    MINI_MAX_W,
    Math.max(MINI_MIN_W, Math.round(size?.width ?? MINI_DEFAULT_W)),
  );
  const height = Math.min(
    MINI_MAX_H,
    Math.max(MINI_MIN_H, Math.round(size?.height ?? MINI_DEFAULT_H)),
  );

  if (miniWidgetWindow && !miniWidgetWindow.isDestroyed()) {
    miniWidgetWindow.setSize(width, height);
    if (miniWidgetWindow.isMinimized()) miniWidgetWindow.restore();
    miniWidgetWindow.show();
    miniWidgetWindow.focus();
    // Keep main hidden while widget is up
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
    return;
  }

  miniWidgetWindow = new BrowserWindow({
    width,
    height,
    minWidth: MINI_MIN_W,
    minHeight: MINI_MIN_H,
    maxWidth: MINI_MAX_W,
    maxHeight: MINI_MAX_H,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // MiniShell never mounts ImmersionView (the only <webview> consumer) — no
      // guest-page capability needed here.
      backgroundThrottling: false,
    },
  });

  const win = miniWidgetWindow;
  attachNavGuards(win);
  if (isDevServer()) forwardRendererConsole(win);

  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.show();
  });
  win.on('closed', () => {
    miniWidgetWindow = null;
    // Returning from mini: restore the full Study OS window unless the app is quitting.
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  void win.loadURL(rendererUrl('miniWidget=1'));

  // Hide the large desktop shell while the floating widget is active.
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
}

function closeMiniWidgetWindow(): void {
  if (miniWidgetWindow && !miniWidgetWindow.isDestroyed()) {
    miniWidgetWindow.close();
  }
  miniWidgetWindow = null;
}

function registerMiniWidgetIpc(): void {
  ipcMain.handle(
    'mini:open',
    (_e, size?: { width?: number; height?: number }): { ok: boolean } => {
      createMiniWidgetWindow(size);
      return { ok: true };
    },
  );
  ipcMain.handle('mini:close', (): { ok: boolean } => {
    closeMiniWidgetWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
    return { ok: true };
  });
  ipcMain.handle(
    'mini:setSize',
    (e, size: unknown): { ok: boolean } => {
      const win = BrowserWindow.fromWebContents(e.sender);
      if (!win || win !== miniWidgetWindow) return { ok: false };
      if (!size || typeof size !== 'object') return { ok: false };
      const w = Math.round(Number((size as { width?: number }).width));
      const h = Math.round(Number((size as { height?: number }).height));
      if (!Number.isFinite(w) || !Number.isFinite(h)) return { ok: false };
      const width = Math.min(MINI_MAX_W, Math.max(MINI_MIN_W, w));
      const height = Math.min(MINI_MAX_H, Math.max(MINI_MIN_H, h));
      // Keep the same center while scaling so the widget doesn't jump.
      const [cx, cy] = win.getPosition();
      const [ow, oh] = win.getSize();
      const nx = Math.round(cx + (ow - width) / 2);
      const ny = Math.round(cy + (oh - height) / 2);
      win.setBounds({ x: nx, y: ny, width, height });
      return { ok: true };
    },
  );
  ipcMain.handle('mini:isOpen', (): boolean =>
    Boolean(miniWidgetWindow && !miniWidgetWindow.isDestroyed()),
  );
  ipcMain.handle('mini:focusMain', (): void => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

const LOCK_DEFAULT_W = 212;
const LOCK_DEFAULT_H = 248;
const LOCK_MIN_W = 180;
const LOCK_MIN_H = 200;
const LOCK_MAX_W = 300;
const LOCK_MAX_H = 360;

/**
 * Borderless transparent lock widget — only the rounded PIN panel is visible;
 * everything outside it is see-through with no rectangular OS shadow.
 */
function createLockscreenWindow(size?: { width?: number; height?: number }): void {
  const width = Math.min(
    LOCK_MAX_W,
    Math.max(LOCK_MIN_W, Math.round(size?.width ?? LOCK_DEFAULT_W)),
  );
  const height = Math.min(
    LOCK_MAX_H,
    Math.max(LOCK_MIN_H, Math.round(size?.height ?? LOCK_DEFAULT_H)),
  );

  if (lockscreenWindow && !lockscreenWindow.isDestroyed()) {
    lockscreenWindow.setSize(width, height);
    if (lockscreenWindow.isMinimized()) lockscreenWindow.restore();
    lockscreenWindow.show();
    lockscreenWindow.focus();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
    return;
  }

  lockscreenDismissedViaUnlock = false;
  lockscreenWindow = new BrowserWindow({
    width,
    height,
    minWidth: LOCK_MIN_W,
    minHeight: LOCK_MIN_H,
    maxWidth: LOCK_MAX_W,
    maxHeight: LOCK_MAX_H,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    show: false,
    center: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Lockscreen never mounts ImmersionView (the only <webview> consumer) — no
      // guest-page capability needed here.
      backgroundThrottling: false,
    },
  });

  const win = lockscreenWindow;
  attachNavGuards(win);
  if (isDevServer()) forwardRendererConsole(win);

  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.show();
  });
  win.on('closed', () => {
    lockscreenWindow = null;
    if (!lockscreenDismissedViaUnlock) {
      // Closing the lock widget without unlocking should not reveal the desktop.
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.close();
      } else {
        app.quit();
      }
      return;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  void win.loadURL(rendererUrl('lockscreen=1'));

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
}

function closeLockscreenWindow(): void {
  if (lockscreenWindow && !lockscreenWindow.isDestroyed()) {
    lockscreenWindow.close();
  }
  lockscreenWindow = null;
}

function broadcastLockscreenUnlocked(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('lockscreen:unlocked');
  }
}

function registerLockscreenIpc(): void {
  ipcMain.handle(
    'lockscreen:open',
    (_e, size?: { width?: number; height?: number }): { ok: boolean } => {
      createLockscreenWindow(size);
      return { ok: true };
    },
  );
  ipcMain.handle('lockscreen:unlock', (): { ok: boolean } => {
    lockscreenDismissedViaUnlock = true;
    closeLockscreenWindow();
    broadcastLockscreenUnlocked();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
    return { ok: true };
  });
  ipcMain.handle(
    'lockscreen:setSize',
    (e, size: unknown): { ok: boolean } => {
      const win = BrowserWindow.fromWebContents(e.sender);
      if (!win || win !== lockscreenWindow) return { ok: false };
      if (!size || typeof size !== 'object') return { ok: false };
      const w = Math.round(Number((size as { width?: number }).width));
      const h = Math.round(Number((size as { height?: number }).height));
      if (!Number.isFinite(w) || !Number.isFinite(h)) return { ok: false };
      const width = Math.min(LOCK_MAX_W, Math.max(LOCK_MIN_W, w));
      const height = Math.min(LOCK_MAX_H, Math.max(LOCK_MIN_H, h));
      const [cx, cy] = win.getPosition();
      const [ow, oh] = win.getSize();
      const nx = Math.round(cx + (ow - width) / 2);
      const ny = Math.round(cy + (oh - height) / 2);
      win.setBounds({ x: nx, y: ny, width, height });
      return { ok: true };
    },
  );
  ipcMain.handle('lockscreen:isOpen', (): boolean =>
    Boolean(lockscreenWindow && !lockscreenWindow.isDestroyed()),
  );
}

// Sections that may be detached into their own OS window. Mirrors the real apps
// in the desktop shell; excludes desktop-only trinkets (note/visualizer).
const POPOUT_SECTIONS = new Set([
  'agent',
  'library', 'novels', 'reading', 'dictionary', 'grammar', 'translate', 'player', 'video', 'music',
  'anki', 'flashcards', 'games', 'stats', 'resources', 'city', 'musicwidget', 'immersion',
  'calendar', 'settings', 'youtube', 'scraper', 'files',
]);

// One real OS window per section, max. Keyed here (not just left to the
// renderer) so a double-click on the pop-out button, or popping the same app
// from two different windows, can never spawn a second copy — the renderer's
// own dedupe (DesktopShell's `open()`) only knows about its *own* windows, not
// ones already popped out.
const popoutWindows = new Map<string, BrowserWindow>();

function broadcastPopoutState(): void {
  const sections = [...popoutWindows.keys()];
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('popout:changed', sections);
  }
}

// Open one app in a genuine, borderless second window. It's the same renderer
// loaded with `?popout=<section>`; the React app sees that flag and renders just
// that app full-window. `frame: false` gives each pop-out a clean widget frame — the
// window's own drag strip + min/max/close (see PopoutChrome) drive it via the
// popout:control IPC below.
// Returns whether a window for that section now exists. Every pre-existing
// caller ignores it; the Agent's permission-gated navigation does not, because
// "the window opened" is the only honest thing it can report back to a user who
// just approved a destination.
function createPopoutWindow(requested: string): boolean {
  // Same reason as `argvOpenSection`: a persisted desktop layout, an OS hotkey
  // and the Agent all hand this a section id that may predate gate 7b.
  const section = LEGACY_WIN_SECTION_ALIASES[requested] ?? requested;
  if (!POPOUT_SECTIONS.has(section)) return false;
  const existing = popoutWindows.get(section);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    return true;
  }
  const mediaCenter = section === 'player' || section === 'video' || section === 'music';
  const mooncapWidget = section === 'city';
  const win = new BrowserWindow({
    width: section === 'musicwidget' ? 480 : mooncapWidget ? 640 : mediaCenter ? 1100 : 900,
    height: section === 'musicwidget' ? 220 : mooncapWidget ? 800 : mediaCenter ? 720 : 640,
    minWidth: section === 'musicwidget' ? 320 : mooncapWidget ? 480 : 360,
    minHeight: section === 'musicwidget' ? 140 : mooncapWidget ? 600 : 240,
    maxWidth: mooncapWidget ? 720 : undefined,
    maxHeight: mooncapWidget ? 900 : undefined,
    maximizable: !mooncapWidget,
    fullscreenable: !mooncapWidget,
    frame: false,
    backgroundColor: mooncapWidget ? '#050711' : '#14131a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
    },
  });
  if (mooncapWidget) win.setAspectRatio(4 / 5);
  // Same guard as main window: never let EPUB / content links hijack the SPA.
  win.webContents.on('will-navigate', (e, url) => {
    const ok =
      !url ||
      url === 'about:blank' ||
      url.startsWith('app://') ||
      url.startsWith('devtools://') ||
      (isDevServer() && url.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL));
    if (!ok) {
      e.preventDefault();
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  popoutWindows.set(section, win);
  win.on('closed', () => {
    popoutWindows.delete(section);
    broadcastPopoutState();
  });
  if (isDevServer()) forwardRendererConsole(win);
  void win.loadURL(rendererUrl(`popout=${encodeURIComponent(section)}`));
  broadcastPopoutState();
  return true;
}

function waitForPopoutLoad(win: BrowserWindow): Promise<boolean> {
  if (win.isDestroyed() || win.webContents.isDestroyed()) return Promise.resolve(false);
  if (!win.webContents.isLoading()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (loaded: boolean) => {
      win.webContents.removeListener('did-finish-load', onLoaded);
      win.webContents.removeListener('did-fail-load', onFailed);
      win.removeListener('closed', onClosed);
      resolve(loaded);
    };
    const onLoaded = () => finish(true);
    const onFailed = () => finish(false);
    const onClosed = () => finish(false);
    win.webContents.once('did-finish-load', onLoaded);
    win.webContents.once('did-fail-load', onFailed);
    win.once('closed', onClosed);
  });
}

async function deliverAgentSettingsDestination(
  win: BrowserWindow,
  destination: AgentNavigationDestination & { section: 'settings'; page: string },
): Promise<boolean> {
  if (!await waitForPopoutLoad(win)) return false;
  const encoded = Buffer.from(JSON.stringify(destination), 'utf8').toString('base64');
  // The payload is main-resolved and base64 encoded before it enters source;
  // no renderer-provided text is interpolated as JavaScript. The three callbacks
  // stay inside this one renderer and let Settings acknowledge only after its
  // static registry and rendered-control checks both pass.
  const script = `(() => new Promise((resolve) => {
    let handled = false;
    let settled = false;
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };
    const detail = JSON.parse(atob('${encoded}'));
    detail.handled = () => { handled = true; };
    detail.accept = () => finish('accepted');
    // Only the explicit transient refusal is retryable. Anything else — including
    // a bare reject() from some future caller — is read as a judgement on the
    // destination and ends the delivery.
    detail.reject = (refusal) => finish(refusal === 'not-ready' ? 'not-ready' : 'invalid');
    window.dispatchEvent(new CustomEvent('${AGENT_NAVIGATION_CHANNELS.settingsDelivery}', {
      detail,
      cancelable: true,
    }));
    // dispatchEvent is synchronous, so a mounted listener has already claimed
    // this attempt. Checking that inline rather than on a timer matters: an
    // occluded window throttles setTimeout to about one tick per second, and
    // this is the branch taken by every attempt made while Settings is still
    // mounting.
    if (!handled) { finish('unhandled'); return; }
    // Settings took the event and then went quiet. That is a window which cannot
    // answer yet, not a window that judged the destination.
    setTimeout(() => finish('not-ready'), ${AGENT_SETTINGS_DELIVERY_ATTEMPT_MS});
  }))()`;

  // did-finish-load precedes React mounting, and a pop-out main just opened is
  // usually occluded, which stops its requestAnimationFrame callbacks outright.
  // So "no answer yet" is the normal state of a correct window for the first few
  // seconds and must be retried. What stays final is a judgement about the
  // destination: an `invalid` refusal is never re-offered, so a page Settings
  // rejected cannot become a success because main asked again.
  const started = Date.now();
  for (;;) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) return false;
    let outcome: AgentSettingsDeliveryOutcome;
    try {
      outcome = await win.webContents.executeJavaScript(script) as AgentSettingsDeliveryOutcome;
    } catch {
      return false;
    }
    const decision = agentSettingsDeliveryDecision(
      outcome,
      Date.now() - started,
      AGENT_SETTINGS_DELIVERY_BUDGET_MS,
    );
    if (decision === 'accept') return true;
    if (decision === 'fail') return false;
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
}

async function openAgentNavigationDestination(
  destination: AgentNavigationDestination,
): Promise<boolean> {
  if (!createPopoutWindow(destination.section)) return false;
  if (destination.section !== 'settings' || !destination.page) return true;
  const win = popoutWindows.get('settings');
  if (!win || win.isDestroyed()) return false;
  return deliverAgentSettingsDestination(win, {
    ...destination,
    section: 'settings',
    page: destination.page,
  });
}

function registerPopoutIpc(): void {
  openSectionHandler = (section: string) => {
    createPopoutWindow(section);
  };
  // The Agent's navigation gate opens windows through this same function, so it
  // is handed over here rather than imported the other way round: `POPOUT_SECTIONS`
  // and `popoutWindows` stay the single owner of what a section means and of the
  // one-window-per-section rule. The gate's own allowlist in
  // `shared/agentNavigation.ts` mirrors this set and is tested against it.
  setAgentNavigationOpener(openAgentNavigationDestination);
  if (pendingOpenSection) {
    createPopoutWindow(pendingOpenSection);
    pendingOpenSection = null;
  }
  ipcMain.handle('popout:open', (_e, section: unknown): boolean => {
    // Answers whether the window was actually opened or raised. This used to be
    // typed `void` and drop `createPopoutWindow`'s boolean on the floor, so a
    // refusal — an id that is not in POPOUT_SECTIONS — resolved exactly like a
    // success. A caller cannot `.catch` a promise that resolves, so every
    // documented "falls back to opening in-window when main refuses" path was
    // unreachable (boss audit 2026-09-05 attempt 4, Finding 6).
    if (typeof section !== 'string') return false;
    return createPopoutWindow(section);
  });
  ipcMain.handle('popout:listOpen', (): string[] => [...popoutWindows.keys()]);
  // Window controls for the frameless pop-out: acts on the window that sent the
  // message, so the custom min/max/close buttons work without a native title bar.
  ipcMain.handle('popout:control', (e, action: unknown): void => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    if (action === 'minimize') win.minimize();
    else if (action === 'maximize' && win.isMaximizable()) win.isMaximized() ? win.unmaximize() : win.maximize();
    else if (action === 'close') win.close();
  });
}

// Music player state shared across every renderer (desktop + pop-outs). One
// window owns the <audio> element; the rest mirror UI via player:sync.
let playerSnapshot: PlayerSnapshot | null = null;

/**
 * Hand leadership back when the window that owned the `<audio>` element is gone, and
 * tell every survivor. Without this the snapshot outlives its publisher and the whole
 * transport delegates into nothing — see `releasePlayerLeadership` for the measurement.
 * Called both when a window closes and on every snapshot read, because a renderer can
 * also disappear through `render-process-gone` without a `closed` event we saw.
 *
 * That second case is why the live set comes from `livePlayerWindowIds` and not from
 * `isDestroyed()`: a crashed renderer leaves its window alive, so the old filter kept
 * the dead leader and this function did nothing on the exact path its comment
 * promised to cover. Boss audit 2026-09-05, Finding 4.
 */
function releasePlayerLeaderIfGone(): void {
  const live = livePlayerWindowIds(BrowserWindow.getAllWindows());
  const released = releasePlayerLeadership(playerSnapshot, live);
  if (!released) return;
  playerSnapshot = released;
  // Only the windows that can still receive it — this runs precisely when one
  // window is dead, and an unguarded `send` into it would throw and abort the
  // broadcast for the survivors, leaving them delegating into nobody.
  const reachable = new Set(live);
  for (const win of BrowserWindow.getAllWindows()) {
    if (!reachable.has(win.webContents?.id ?? -1)) continue;
    win.webContents.send('player:sync', released);
  }
}

function registerPlayerSyncIpc(): void {
  ipcMain.handle('player:windowId', (e): number => e.sender.id);
  ipcMain.handle('player:getSnapshot', (): PlayerSnapshot | null => {
    releasePlayerLeaderIfGone();
    return playerSnapshot;
  });
  app.on('browser-window-created', (_event, win) => {
    win.once('closed', () => releasePlayerLeaderIfGone());
  });
  ipcMain.on('player:publish', (e, snap: PlayerSnapshot) => {
    playerSnapshot = snap;
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.webContents.id !== e.sender.id) {
        win.webContents.send('player:sync', snap);
      }
    }
  });
  ipcMain.on('player:command', (e, cmd: PlayerCommand) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.webContents.id !== e.sender.id) {
        win.webContents.send('player:command', cmd);
      }
    }
  });
}

// NOTE: an earlier "syncRendererStorageWithProfiles" step lived here. It
// compared profiles.json mtime against the Local Storage directory mtime and
// called session.clearStorageData() when profiles.json looked newer — which
// wiped EVERY saved deck, CSV draft, preset, theme and window layout on a
// routine restart (profiles.json is rewritten often; LevelDB flushes lazily,
// so the check misfired constantly). Renderer storage never mirrors
// profiles.json — profile state is IPC-served — so there is nothing to keep
// "in sync". Do not reintroduce a blanket clearStorageData() call.

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return;
  if (isDevServer()) startDebugBridge();
  ensureLibrary();
  if (typeof MAIN_WINDOW_VITE_DEV_SERVER_URL === 'undefined' || !MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    registerAppProtocol();
    registerContentSecurityPolicy();
  }
  registerMediaProtocol();
  registerLocalFileProtocol();
  registerLibraryIpc();
  registerReadingListsIpc();
  // §11.3's reminders read the library for `lastReadAt` and `progress`. The
  // reader is passed in rather than imported by the scheduler so `library.ts`
  // stays the only module that knows where `library.json` is.
  const readingReminders = registerReadingRemindersIpc(app.getPath('userData'), {
    readActivity: () => {
      const items = listLibraryItems();
      let lastReadAt: number | null = null;
      const activity = items.map((item) => {
        if (typeof item.lastReadAt === 'number' && (lastReadAt === null || item.lastReadAt > lastReadAt)) {
          lastReadAt = item.lastReadAt;
        }
        return {
          itemId: item.id,
          percent: typeof item.progress?.percent === 'number' ? item.progress.percent : 0,
          ...(typeof item.lastReadAt === 'number' ? { lastReadAt: item.lastReadAt } : {}),
        };
      });
      return { lastReadAt, items: activity };
    },
  });
  registerReadingListsLateBinding(onLibraryItemsAdded, (bindings) => {
    for (const binding of bindings) readingReminders.noteBinding(binding);
  });
  registerDictionaryIpc();
  registerDiagnosticsIpc();
  registerShellIpc();
  registerAppLifecycleIpc();
  registerToolboxIpc();
  registerMediaIpc();
  registerFlashcardAudioIpc();
  registerYtPlaylistsIpc();
  registerProfileIpc();
  registerAnkiIpc();
  registerProfileRulesIpc();
  registerApkgIpc();
  registerAnkiAiAdditionsIpc();
  registerDesktopIpc();
  registerDisplayIpc();
  configureDesktopWindows({
    rendererUrl,
    attachNavGuards,
    forwardConsole: forwardRendererConsole,
    isDevServer: isDevServer(),
    mainWindow: () => mainWindow,
  });
  registerDesktopWindowsIpc();
  // Detached Study Blocks. Registering the handlers opens nothing — a window exists
  // only once a workspace actually asks for one.
  configureStudyBlockWindows({
    rendererUrl,
    attachNavGuards,
    forwardConsole: forwardRendererConsole,
    isDevServer: isDevServer(),
    // "Send to Display" must mean the same thing for the Notebook window a Notes block
    // opened as it does for a detached transcript, and app pop-outs live in this file.
    popoutWindow: (section) => {
      const win = popoutWindows.get(section);
      return win && !win.isDestroyed() ? win : null;
    },
  });
  registerStudyBlockWindowIpc();
  registerDeskDragIpc();
  registerFileRouterIpc();
  registerFilesAppIpc();
  registerTranslateIpc();
  registerTranslateAnalysisIpc();
  registerSentenceAnalysisIpc();
  registerVideoClipIpc();
  registerMediaStudyAssistantIpc();
  registerMediaStudyOrchestratorIpc();
  registerLocalAgentIpc();
  registerLocalAgentSchedulerIpc();
  registerMiningIpc();
  registerImmersionIpc();
  registerSystemMetricsIpc();
  registerScraperIpc();
  // Phase-5 reading boundary. Read-only over the sidecar; every handler answers
  // with a state instead of rejecting when the sidecar is down.
  registerReadingIpc();
  // Seanime sidecar. On by default; SEANIME_SIDECAR=0 opts out. Registering the IPC
  // does not spawn anything — the sidecar starts when a renderer asks it to.
  registerSeanimeIpc();
  // Phase-8 authenticated MyAnimeList sync. Registering the handlers starts
  // nothing: there is no background loop and no sync-on-launch, because every
  // write here mutates a real MAL list irreversibly. Each handler answers a
  // user-initiated action, and answers "not configured" until the user supplies
  // a client id of their own — none is shipped.
  registerMalSyncIpc();
  // Where a fetched list is kept once the user asks for it to be kept. Local
  // disk only — this module has no MAL client, so it cannot sync on its own.
  registerMalLibraryIpc();
  registerReleaseIpc();
  registerResourcesCatalogIpc();
  registerCollectedToolsIpc();
  registerStatsIpc();
  registerJitenIpc();
  // Phase 0 credentials vault — registered before nothing in particular, but it
  // must exist before the Settings window can open its API Keys page.
  registerCredentialIpc();
  registerDownloadIpc();
  registerMangaOcrIpc();
  registerBookOcrIpc();
  registerMainI18nIpc();
  registerExtensionBridgeIpc();
  registerWindowChromeIpc(recreateMainWindow);
  registerPopoutIpc();
  registerBlancIpc();
  registerMiniWidgetIpc();
  registerLockscreenIpc();
  registerPlayerSyncIpc();
  configureCompanionHost({
    rendererUrl,
    forwardConsole: forwardRendererConsole,
    isDevServer: isDevServer(),
  });
  registerCompanionHostIpc();
  registerBuddySchedulerIpc();
  configureSystemDictionary({
    rendererUrl,
    forwardConsole: forwardRendererConsole,
    attachNavGuards,
    isDevServer: isDevServer(),
  });
  registerSystemDictionaryIpc();
  configureReadingLens({
    rendererUrl,
    forwardConsole: forwardRendererConsole,
    attachNavGuards,
    isDevServer: isDevServer(),
  });
  registerReadingLensIpc();
  createWindow();
  // Assignments are seeded from `screen`, which is only live now. Run once the
  // main window exists, so its own display is excluded from the secondaries.
  syncDesktopWindows();
  // Cold-start `--open=library` (etc.): main boots for services, then open the pop-out.
  const coldOpen = argvOpenSection(process.argv);
  if (coldOpen) createPopoutWindow(coldOpen);
  startExtensionServer();
  // System-wide popup dictionary: registers its global hotkey + tray if enabled.
  startSystemDictionary();
  // Reading Lens: registers its own global hotkey (screen-region OCR reader).
  startReadingLens();
  // Provision + load offline dictionaries in the background so the window paints
  // immediately. Consumers that need glosses (mining, the pop-up) await
  // initYomitan() themselves, so they observe the loaded indices without any
  // notification from here.
  void initYomitan();
  // Reconcile downloaded models against disk (and refresh the asset registry)
  // in the background — consumers ask isInstalled() before touching a model, so
  // a slow first pass degrades to "not installed yet", never to a crash.
  void initDownloads();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Companion host is skipTaskbar; still count as a window — close it so quit proceeds.
  closeCompanionHost();
  stopBuddyScheduler();
  stopExtensionServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  stopSeanime();
  stopLocalAgentRuntime();
  stopLocalAgentScheduler();
  stopBuddyScheduler();
  stopExtensionServer();
  stopSystemDictionary();
  stopReadingLens();
  stopDebugBridge();
  // The local model runtime was the one subsystem here with no stop: contexts, weights and the
  // llama.cpp backend all released on idle deadlines only, so a quit inside a 5-minute idle
  // window exited holding them. Measured 2026-08-24 on one Dictionary burst — 1,270 MB of KV
  // cache and 1,101 MB of weights still resident 8 minutes in. It now lives in its own process,
  // so one kill returns all three at once and no native teardown can hang the quit.
  stopLlamaHost();
});
