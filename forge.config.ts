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
        timer = setInterval(() => {}, 30_000);
      },
      postPackage: async () => {
        if (timer) clearInterval(timer);
        timer = undefined;
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
    extraResource: ['public'],
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
  ],
};

export default config;
