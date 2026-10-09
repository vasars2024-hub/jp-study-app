import fs from 'node:fs';
import path from 'node:path';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { PluginBase } from '@electron-forge/plugin-base';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

/**
 * electron-packager runs long async work (extract Electron, copy ~1 GB public
 * assets). On some Node/Forge builds the event loop drains and the process exits
 * before packager finishes — spinner stuck, 0% CPU, empty `out/`. A no-op timer
 * keeps the loop alive until postPackage.
 */
class PackagerKeepAlivePlugin extends PluginBase<Record<string, never>> {
  name = 'packager-keep-alive';

  getHooks() {
    let timer: ReturnType<typeof setInterval> | undefined;
    return {
      prePackage: async () => {
        timer = setInterval(() => {
          /* no-op: only here to hold the event loop open */
        }, 30_000);
      },
      postPackage: async () => {
        if (timer) clearInterval(timer);
        timer = undefined;
      },
    };
  }
}

/**
 * The Seanime sidecar's packaged home. `src/main/seanime/exePath.ts` resolves
 * `<resourcesPath>/seanime/seanime.exe` at runtime and has named that slot since the
 * exe path stopped being a hardcoded developer home directory; nothing populated it, so
 * a packaged build shipped no sidecar at all and the media surface was dead on any
 * machine but the one the proofs ran on. `SIDECAR_RESOURCE_DIR` must stay equal to
 * `PACKAGED_RESOURCE_DIR` over there — `src/main/__tests__/seanimeExePath.test.ts`
 * fails if the two drift.
 *
 * The binary is staged into a gitignored directory rather than committed: it is 84 MB
 * and it is GPL-3.0. `docs/migration/LICENSING_PLAN.md` treats an *unmodified* pinned
 * binary with a documented HTTP API as the conventional separate-program posture, and
 * obligations attach on distribution — this app is `private: true`. A *patched* sidecar
 * (`docs/migration/tools/build-patched-sidecar.mjs`, needed for the dual-subtitle fix)
 * is a modified Go server, so shipping one obliges publishing that fork's source.
 * Staging honours `SEANIME_EXE`, which is how a patched binary gets in — deliberately,
 * and with that consequence recorded here.
 */
const SIDECAR_RESOURCE_DIR = 'seanime';
const SIDECAR_EXE = 'seanime.exe';
/** Copied into the resources root by basename, so this must be named for the slot. */
const SIDECAR_STAGING_DIR = path.join('build', SIDECAR_RESOURCE_DIR);
/** The pinned sibling checkout, same rule `exePath.ts` uses in a dev tree. */
const SIDECAR_SOURCE_CHECKOUT = 'seanime-upstream';
/** Opt out of a sidecar-bearing package, loudly, rather than shipping a broken one. */
const SIDECAR_SKIP_ENV = 'SEANIME_SKIP_SIDECAR_PACKAGING';

/**
 * Stages `seanime.exe` into the resource slot before packaging, and **fails the build**
 * when it cannot. A silently absent binary is exactly the failure this exists to prevent:
 * the app packages fine, installs fine, and every media surface is dead at runtime.
 *
 * The staging directory is always created, even when empty — `extraResource` throws
 * ENOENT on a missing path, and an empty slot still produces the actionable
 * "seanime.exe not found. Tried: …" message from `exePath.ts` instead of a crash.
 */
class SeanimeSidecarStagingPlugin extends PluginBase<Record<string, never>> {
  name = 'seanime-sidecar-staging';

  getHooks() {
    return {
      prePackage: async (_config: unknown, platform?: string) => {
        const stagingDir = path.resolve(process.cwd(), SIDECAR_STAGING_DIR);
        const target = path.join(stagingDir, SIDECAR_EXE);
        fs.mkdirSync(stagingDir, { recursive: true });

        // A .exe has no business in a Linux package, and the makers include deb/rpm.
        if (platform && platform !== 'win32') {
          fs.rmSync(target, { force: true });
          console.log(`[sidecar] platform ${platform}: shipping no Windows sidecar`);
          return;
        }

        if (process.env[SIDECAR_SKIP_ENV]?.trim()) {
          fs.rmSync(target, { force: true });
          console.warn(
            `[sidecar] ${SIDECAR_SKIP_ENV} is set — packaging WITHOUT the sidecar. ` +
              'The media workspace will be dead in this build.',
          );
          return;
        }

        const override = process.env.SEANIME_EXE?.trim();
        const source =
          override ||
          path.resolve(process.cwd(), '..', SIDECAR_SOURCE_CHECKOUT, SIDECAR_EXE);
        if (!fs.existsSync(source)) {
          throw new Error(
            `[sidecar] cannot stage ${SIDECAR_EXE}: ${source} does not exist ` +
              `(${override ? 'from SEANIME_EXE' : `expected the pinned ${SIDECAR_SOURCE_CHECKOUT} sibling checkout`}). ` +
              `Point SEANIME_EXE at a binary, or set ${SIDECAR_SKIP_ENV}=1 to package without one.`,
          );
        }

        fs.copyFileSync(source, target);
        const bytes = fs.statSync(target).size;
        console.log(
          `[sidecar] staged ${source} -> ${path.join(SIDECAR_STAGING_DIR, SIDECAR_EXE)} (${bytes} bytes); ` +
            `resources slot ${SIDECAR_RESOURCE_DIR}/${SIDECAR_EXE}`,
        );
      },
    };
  }
}

/**
 * Windows identity and installer. The exe stays `jp-study-app.exe` and package.json
 * keeps `productName: jp-study-app` on purpose: `productName` is Electron's app name,
 * and that names the user-data folder (%APPDATA%\jp-study-app, many GB of decks, books
 * and dictionaries). What Windows SHOWS — Task Manager, the taskbar, "Open with",
 * Programs and Features, the Start-menu shortcut — comes from the version resource
 * below and from the Squirrel title, and those say "Gum".
 *
 * `SQUIRREL_APP_ID` must equal `src/main/squirrelEvents.ts` (it names the install
 * folder and the shortcut AppUserModelID); `squirrelEvents.test.ts` pins the two.
 */
const PRODUCT_NAME = 'Gum';
const SQUIRREL_APP_ID = 'jp_study_app';
const APP_VERSION: string = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')).version;
/**
 * Code signing is OFF until the owner has an Authenticode certificate (README,
 * "Code signing"). Set both variables and `make` signs the app exe (packager, via
 * @electron/windows-sign) and Setup.exe/Update.exe (Squirrel). Nothing is ever
 * signed implicitly.
 */
const SIGN_CERT_FILE = process.env.GUM_WIN_CERT_FILE?.trim() || '';
const SIGN_CERT_PASSWORD = process.env.GUM_WIN_CERT_PASSWORD ?? '';
const signing = SIGN_CERT_FILE
  ? { certificateFile: SIGN_CERT_FILE, certificatePassword: SIGN_CERT_PASSWORD }
  : undefined;

/**
 * Delta packages (docs/RELEASING.md). With `remoteReleases`, electron-winstaller runs
 * Squirrel's SyncReleases first, which downloads the previous release's RELEASES and
 * full nupkg into the output folder; `--releasify` then writes `<id>-<v>-delta.nupkg`
 * beside the new full one, and an installed copy downloads only the difference.
 *
 * It is the REPO url, not the feed: SyncReleases treats a github.com url as
 * `owner/repo` and asks the GitHub API for the latest release (`GITHUB_TOKEN`, when
 * set, is passed as `remoteToken` for the rate limit). `SQUIRREL_REMOTE_RELEASES_URL`
 * in src/main/squirrelUpdater.ts must equal it; `squirrelFeed.test.ts` pins the two.
 *
 * SyncReleases fails the whole make when there is nothing to sync, which is the case
 * until the first Squirrel release exists (v1.0.0 and v1.0.1 shipped zips only). So
 * the `preMake` hook below probes the update feed's RELEASES first and enables deltas
 * only when a previous Squirrel release is actually there.
 *   GUM_SQUIRREL_DELTA=off      never sync (a full package only)
 *   GUM_SQUIRREL_DELTA=require  fail the make when no previous release can be synced
 *   GUM_SQUIRREL_REMOTE_RELEASES=<url>  sync from somewhere else (a local folder server)
 */
const SQUIRREL_REMOTE_RELEASES = 'https://github.com/vasars2024-hub/jp-study-app';
const SQUIRREL_FEED = `${SQUIRREL_REMOTE_RELEASES}/releases/latest/download`;
/** Decided in `preMake`, read by the Squirrel maker's config fetcher (it runs later). */
let squirrelDeltaBase: string | undefined;

async function resolveSquirrelDeltaBase(): Promise<string | undefined> {
  const mode = (process.env.GUM_SQUIRREL_DELTA ?? '').trim().toLowerCase();
  if (mode === 'off' || mode === '0' || mode === 'false') {
    console.log('[squirrel] GUM_SQUIRREL_DELTA=off: full package only, no delta');
    return undefined;
  }
  const override = process.env.GUM_SQUIRREL_REMOTE_RELEASES?.trim();
  if (override) return override;
  let reason: string;
  try {
    const res = await fetch(`${SQUIRREL_FEED}/RELEASES`, { redirect: 'follow', signal: AbortSignal.timeout(20_000) });
    if (res.ok && /-full\.nupkg/i.test(await res.text())) {
      console.log(`[squirrel] previous release found at ${SQUIRREL_FEED}: building a delta package`);
      return SQUIRREL_REMOTE_RELEASES;
    }
    reason = `RELEASES answered ${res.status}`;
  } catch (err) {
    reason = err instanceof Error ? err.message : String(err);
  }
  if (mode === 'require') {
    throw new Error(`[squirrel] GUM_SQUIRREL_DELTA=require but no previous Squirrel release could be read (${reason})`);
  }
  console.warn(`[squirrel] no previous Squirrel release to diff against (${reason}): full package only`);
  return undefined;
}

/**
 * Installer size (perf3 pass, measured from the files, compressed estimates):
 * production `node_modules` files nothing in the app ever loads. Each one is
 * excluded from the copy, never from a dependency the app requires.
 */
const UNUSED_RUNTIME_FILES: readonly RegExp[] = [
  // kuromoji's own test fixtures (one 23 MB matrix.def, ~6 MB compressed). The
  // dictionary the main-process tokenizer reads is `kuromoji/dict/`.
  /^\/node_modules\/kuromoji\/test(\/|$)/,
  // llama.cpp's source as a git bundle (31 MB, ~31 MB compressed). Only
  // node-llama-cpp's from-source rebuild reads it (`cloneLlamaCppRepo`), which
  // needs a compiler toolchain an installed app does not have; the prebuilt
  // CPU and Vulkan binaries it would replace ship beside it.
  /^\/node_modules\/node-llama-cpp\/llama\/gitRelease\.bundle$/,
  // The TypeScript compiler (39 MB, ~7 MB): an optional peer of node-llama-cpp
  // that only its CLI (`inspect gpu`) imports. Nothing in the app requires it.
  /^\/node_modules\/typescript(\/|$)/,
  // sql.js: main loads `dist/sql-wasm.js` + `dist/sql-wasm.wasm`
  // (`src/main/anki/apkgCollection.ts`). The asm.js, debug and worker builds and
  // the release zips (~19 MB, ~6 MB) are never required.
  /^\/node_modules\/sql\.js\/dist\/(sql-asm[^/]*|[^/]*-debug\.[^/]*|worker\.[^/]*|sqljs-[^/]*\.zip)$/,
];

/**
 * `public/` paths dropped from the packaged resources after they are copied.
 *
 * - `cedict/`: CC-CEDICT (9.4 MB, ~3.8 MB compressed) is the `cc-cedict` asset in
 *   Settings > Storage (`src/shared/assetRegistry.ts`, the Chinese starter offered
 *   at first run), which `src/main/dictionary/service.ts` already prefers. Without
 *   either copy a Chinese lookup reports "no Chinese dictionary installed" with a
 *   link to get one (`CedictNotInstalledError`). Only Chinese study needs it.
 * - The JSEP and JSPI builds of onnxruntime-web (38 MB, ~9.5 MB): the renderer's
 *   Whisper worker loads `@huggingface/transformers`' web build, whose
 *   onnxruntime-web/webgpu bundle names only the `asyncify` engine (and the plain
 *   one for Safari). Both stay; the source `public/` is untouched, so the
 *   `check-runtime-assets` preflight is unchanged.
 */
const ON_DEMAND_PUBLIC_PATHS: readonly string[] = [
  'cedict',
  'ort/ort-wasm-simd-threaded.jsep.mjs',
  'ort/ort-wasm-simd-threaded.jsep.wasm',
  'ort/ort-wasm-simd-threaded.jspi.mjs',
  'ort/ort-wasm-simd-threaded.jspi.wasm',
];

/** Every `public/` directory the packager copied under `buildPath` (resources/ or *.app/Contents/Resources/). */
function packagedPublicDirs(buildPath: string): string[] {
  const candidates = [path.join(buildPath, 'resources', 'public')];
  try {
    for (const entry of fs.readdirSync(buildPath)) {
      if (entry.endsWith('.app')) candidates.push(path.join(buildPath, entry, 'Contents', 'Resources', 'public'));
    }
  } catch {
    /* not a directory listing we can read: only the default candidate */
  }
  return candidates.filter((dir) => fs.existsSync(dir));
}

const config: ForgeConfig = {
  packagerConfig: {
    icon: 'assets/icon',
    appCopyright: `Copyright (C) ${new Date().getFullYear()} Arseniy. GPL-3.0-or-later.`,
    win32metadata: {
      CompanyName: PRODUCT_NAME,
      FileDescription: PRODUCT_NAME,
      ProductName: PRODUCT_NAME,
      InternalName: PRODUCT_NAME,
      OriginalFilename: 'jp-study-app.exe',
    },
    ...(signing ? { windowsSign: signing } : {}),
    // No asar: the app bundles ~945 MB of model/engine/dictionary files, and
    // packing that into an asar archive chokes the packager. Shipping loose
    // files is simpler and faster — the app:// protocol reads them by path, and
    // ffmpeg/tesseract stay executable.
    asar: false,
    // Ship large runtime blobs once via extraResource (not duplicated into Vite output).
    // Each entry lands in the resources root under its basename, so `build/seanime`
    // becomes `<resourcesPath>/seanime` — the slot `exePath.ts` resolves. Populated by
    // SeanimeSidecarStagingPlugin's prePackage hook; the directory always exists by then.
    //
    // `private-assets/` is the owner's git-ignored third-party art (see .gitignore). It is
    // shipped only when the folder exists, so a public clone packages exactly as before;
    // main.ts serves its `public/` after ours (`<resourcesPath>/private-assets/public`).
    extraResource: ['public', SIDECAR_STAGING_DIR, ...(fs.existsSync('private-assets') ? ['private-assets'] : [])],
    // Optional assets the app downloads on demand, and engine builds it never
    // loads, leave the packaged copy of `public/` (see ON_DEMAND_PUBLIC_PATHS).
    afterCopyExtraResources: [
      (buildPath, _electronVersion, _platform, _arch, done) => {
        try {
          for (const dir of packagedPublicDirs(buildPath)) {
            for (const rel of ON_DEMAND_PUBLIC_PATHS) {
              fs.rmSync(path.join(dir, ...rel.split('/')), { recursive: true, force: true });
            }
          }
          done();
        } catch (err) {
          done(err instanceof Error ? err : new Error(String(err)));
        }
      },
    ],
    // Ship Vite output + production node_modules; public ships once via extraResource.
    ignore: (file) => {
      if (!file) return false;
      if (file.startsWith('/.vite')) return false;
      if (UNUSED_RUNTIME_FILES.some((pattern) => pattern.test(file))) return true;
      if (file.startsWith('/node_modules')) return false;
      if (file.startsWith('/jp-study-app-lockscrene-4d2eb54a')) return true;
      if (file.startsWith('/out')) return true;
      if (file.startsWith('/.git')) return true;
      return true;
    },
  },
  // better-sqlite3 v13 ships N-API/ABI-stable prebuilds that load in Electron 42
  // as-is, so skip the native rebuild: it needs Visual Studio build tools and
  // would only replace a working binary. (@electron/rebuild `ignoreModules`.)
  rebuildConfig: { ignoreModules: ['better-sqlite3'] },
  hooks: {
    // Before any maker's config is resolved: is there a previous Squirrel release to
    // build a delta against? (See SQUIRREL_REMOTE_RELEASES above.)
    preMake: async () => {
      squirrelDeltaBase = await resolveSquirrelDeltaBase();
    },
  },
  makers: [
    // The Windows installer: per-user (no admin), Start-menu + desktop shortcut,
    // an uninstaller in Settings > Apps, and in-place updates (squirrelUpdater.ts).
    // src/main/squirrelEvents.ts handles its lifecycle events and file associations.
    //
    // Squirrel copies the whole app to %TEMP% and compresses it again, and has been
    // seen to stall at 0% CPU on a ~1 GB bundle. Build it with
    // `node tools/package-app.cjs --installer`: that packages and PRUNES first (2 GB of
    // node_modules -> ~0.4 GB) and then runs only this maker over the pruned app.
    new MakerSquirrel({
      name: SQUIRREL_APP_ID,
      title: PRODUCT_NAME,
      authors: 'Arseniy',
      exe: 'jp-study-app.exe',
      setupExe: `${PRODUCT_NAME}-${APP_VERSION} Setup.exe`,
      setupIcon: path.resolve(process.cwd(), 'assets', 'icon.ico'),
      // Programs and Features fetches the uninstall icon from a URL at install time.
      iconUrl: 'https://raw.githubusercontent.com/vasars2024-hub/jp-study-app/master/assets/icon.ico',
      noMsi: true,
      ...(signing ?? {}),
      // Getters, not values: MakerSquirrel spreads this object inside make(), which runs
      // after the `preMake` hook decided whether a previous release exists. Undefined
      // = no SyncReleases, a full package only.
      get remoteReleases(): string | undefined {
        return squirrelDeltaBase;
      },
      get remoteToken(): string | undefined {
        return squirrelDeltaBase ? process.env.GITHUB_TOKEN?.trim() || undefined : undefined;
      },
    }),
    // The portable build, unchanged: extract anywhere, run jp-study-app.exe.
    new MakerZIP({}, ['win32', 'darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new VitePlugin({
      // Build main/preload/renderer one at a time — parallel Vite instances can
      // exhaust memory on large apps and freeze Forge at postPackage with no error.
      concurrent: 1,
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
        {
          // The dictionary import utility process. `src/main/dictionary/service.ts`
          // recorded for several phases that the imports it exposes block the main
          // thread for minutes and that the `utilityProcess` which would host them
          // was unbuildable without an entry point — this is that entry point.
          //
          // `target: 'main'` because it is a Node/Electron child, built with the
          // same externals and CJS output as the main bundle; Vite names the output
          // after the entry file, so `importJobs.ts` resolves it as
          // `<.vite/build>/importWorker.js` beside `main.js`.
          entry: 'src/main/dictionary/importWorker.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          // The .apkg draft-read utility process. ANKI_DECK_WORKBENCH_PLAN.md
          // gate 9 requires the 100,000-note fixture to be read without freezing
          // the main event loop, and measurement showed main answering 3 IPC
          // heartbeats during a 6,217 ms read. Same shape as the dictionary
          // worker above: `target: 'main'` for the Node/Electron child, and Vite
          // names the output after the entry, so `apkgReadHost.ts` resolves it as
          // `<.vite/build>/apkgReadWorker.js` beside `main.js`.
          entry: 'src/main/anki/apkgReadWorker.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          // The local-model utility process. `llamaHostWorker.ts` carries the measurement: a
          // load/unload cycle returns 2,434 MB on its own but leaves +534.6 MB / +3,349 handles
          // that no disposal reclaims, because `getLlama()` loads another copy of the native addon
          // per call and deleting a require-cache entry does not unload a DLL. A process exit does.
          // Same shape as the two workers above — `target: 'main'` for the Node/Electron child,
          // built with the same externals (`node-llama-cpp` stays external), and Vite names the
          // output after the entry so `llamaHost.ts` resolves it as
          // `<.vite/build>/llamaHostWorker.js` beside `main.js`.
          entry: 'src/main/llamaHostWorker.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          // Japanese neural speech keeps four ONNX graphs (~400 MB) outside
          // Electron's event loop and address space. The host reuses this
          // worker across a deck, then reaps it after the idle grace period.
          entry: 'src/main/flashcardTtsWorker.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          // Local-deck APKG authoring performs SQLite and zip work off main.
          entry: 'src/main/anki/localDeckApkgWorker.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      // Disabled: we ship without asar (large bundled models), so these
      // asar-only protections don't apply and would block app load.
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: false,
    }),
    new PackagerKeepAlivePlugin({}),
    new SeanimeSidecarStagingPlugin({}),
  ],
};

export default config;
