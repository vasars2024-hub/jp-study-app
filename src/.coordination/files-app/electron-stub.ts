/**
 * An `electron` stand-in, for bundling the census with esbuild's
 * `--alias:electron=...`.
 *
 * The mine path (`main/filesApp/mineSource.ts`) reaches `main/mining.ts` for
 * `extractEpubSections` and `splitSentences`, and that module imports `electron`
 * and registers IPC at module scope. The census runs outside Electron, so the
 * import has to resolve to something.
 *
 * This is the SAME stub `filesAppMineSource.test.ts` already uses, for the same
 * reason, so the census and that suite exercise one code path and not two.
 * Every member here is inert on purpose: nothing the census calls goes near
 * them, and a stub that silently *did* something would let the census pass on
 * behaviour the real app does not have.
 */
import path from 'node:path';

/**
 * Electron resolves `userData` as `appData/<name>`, and `--gate9` reaches main
 * code that reads the profile through it (`resolveItemEpubPath`,
 * `readMiningConfig`, the frequency-dictionary root). The first version of this
 * stub answered the `appData` ROOT for every name, so those readers looked one
 * directory too high, found nothing and fell back to defaults — a silent wrong
 * answer, which is worse than a throw. `JP_CENSUS_USERDATA` lets the census
 * point main at the same profile it passed to `buildFilesIndex`, so one run
 * cannot measure two different profiles.
 */
export const app = {
  getPath: (name?: string) => {
    const appData = process.env.APPDATA ?? '';
    if (name === 'userData') {
      return process.env.JP_CENSUS_USERDATA || path.join(appData, 'jp-study-app');
    }
    return appData;
  },
  getName: () => 'jp-study-app',
};

/**
 * Handlers registered by `registerMiningIpc()` land here so `--gate9` can call
 * the PRODUCTION entry point (`mining:analyzeEpub`, `mining:getConfig`) rather
 * than a private copy of it. Recording is what real `ipcMain.handle` does, so
 * this makes the stub more faithful, not less: nothing is invoked unless the
 * census asks for a named channel by hand.
 */
export const capturedIpcHandlers = new Map<string, (...args: unknown[]) => unknown>();
export const ipcMain = {
  handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
    capturedIpcHandlers.set(channel, handler);
  },
  removeHandler: (channel: string) => {
    capturedIpcHandlers.delete(channel);
  },
};
export const dialog = {};
export const shell = {};
export const BrowserWindow = { getAllWindows: () => [] };
export const protocol = {
  registerSchemesAsPrivileged: () => undefined,
  handle: () => undefined,
};
export const nativeImage = { createFromPath: () => ({ isEmpty: () => true }) };
// Reached through `main/mining.ts`'s AI-provider and utility-process imports.
// `isEncryptionAvailable` answers FALSE rather than true: the census must never
// look like a context that can decrypt the user's stored credentials.
export const safeStorage = {
  isEncryptionAvailable: () => false,
  encryptString: () => Buffer.alloc(0),
  decryptString: () => '',
};
export const utilityProcess = { fork: () => ({ on: () => undefined, kill: () => undefined }) };
