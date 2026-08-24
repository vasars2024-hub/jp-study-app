import fs from 'node:fs';
import path from 'node:path';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { PluginBase } from '@electron-forge/plugin-base';
import { MakerZIP } from '@electron-forge/maker-zip';
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

const config: ForgeConfig = {
  packagerConfig: {
    icon: 'assets/icon',
    // No asar: the app bundles ~945 MB of model/engine/dictionary files, and
    // packing that into an asar archive chokes the packager. Shipping loose
    // files is simpler and faster — the app:// protocol reads them by path, and
    // ffmpeg/tesseract stay executable.
    asar: false,
    // Ship large runtime blobs once via extraResource (not duplicated into Vite output).
    // Each entry lands in the resources root under its basename, so `build/seanime`
    // becomes `<resourcesPath>/seanime` — the slot `exePath.ts` resolves. Populated by
    // SeanimeSidecarStagingPlugin's prePackage hook; the directory always exists by then.
    extraResource: ['public', SIDECAR_STAGING_DIR],
    // Ship Vite output + production node_modules; public ships once via extraResource.
    ignore: (file) => {
      if (!file) return false;
      if (file.startsWith('/.vite')) return false;
      if (file.startsWith('/node_modules')) return false;
      if (file.startsWith('/jp-study-app-lockscrene-4d2eb54a')) return true;
      if (file.startsWith('/out')) return true;
      if (file.startsWith('/.git')) return true;
      return true;
    },
  },
  rebuildConfig: {},
  makers: [
    // Squirrel copies the full app to temp then compresses again — it routinely
    // deadlocks at 0% CPU on ~1 GB bundles. ZIP the packaged folder instead.
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
