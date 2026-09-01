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
export const app = {
  getPath: () => process.env.APPDATA ?? '',
  getName: () => 'jp-study-app',
};
export const ipcMain = { handle: () => undefined, removeHandler: () => undefined };
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
