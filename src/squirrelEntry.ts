/**
 * The main-process entry Electron runs first (`package.json` `main` ->
 * `.vite/build/squirrelEntry.js`). It exists so a Squirrel.Windows lifecycle launch never
 * waits for the app.
 *
 * Squirrel launches the exe with `--squirrel-install|updated|uninstall|obsolete` and kills it
 * after ~15 s. When `src/main.ts` was the entry, its hook ran only after every hoisted ES
 * import had loaded: the ~5 MB main bundle plus linkedom, adm-zip, ffmpeg-static and the rest
 * of its externals, which on a slow first install (cold disk, antivirus scanning freshly
 * extracted files) ate into the same 15 s the hook's own Update.exe and `reg import` steps
 * were budgeted against. Here the hook runs before any of that is even read from disk.
 *
 * KEEP THIS FILE'S STATIC IMPORT GRAPH TINY: `electron`, Node builtins and
 * `./main/squirrelEvents` (itself builtins only). `squirrelEntryGraph.test.ts` walks it and
 * builds it, and fails on anything else or on a bundle over its size cap. The app is loaded
 * with a computed `require()` of the sibling `main.js` bundle, which the bundler leaves alone.
 */
import path from 'node:path';
import { app } from 'electron';
import { bootEntry } from './main/squirrelEvents';

bootEntry({
  argv: process.argv,
  platform: process.platform,
  // Squirrel waits for this process to exit; nothing else needs to run.
  exit: (code) => app.exit(code),
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires -- a runtime path, deliberately not a bundled import
  loadApp: () => require(path.join(__dirname, 'main.js')),
});
