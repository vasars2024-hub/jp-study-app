/**
 * Bound how long a window's first paint waits on the IndexedDB restores.
 *
 * Blanc (and Study OS) reconcile the durable IndexedDB copies with the
 * localStorage cache before rendering. A stalled IndexedDB open (a blocked
 * upgrade, a wedged profile) used to leave the window blank forever. Now the
 * restores get `STARTUP_RESTORE_TIMEOUT_MS`; past it the window renders on the
 * localStorage cache and the restore keeps running in the background. Its late
 * outcome is only logged.
 */

export const STARTUP_RESTORE_TIMEOUT_MS = 4_000;

export type StartupRestoreOutcome = 'done' | 'failed' | 'timeout';

export function awaitStartupRestore(
  restore: Promise<unknown>,
  options: { timeoutMs?: number; label?: string; log?: (message: string, detail?: unknown) => void } = {},
): Promise<StartupRestoreOutcome> {
  const timeoutMs = options.timeoutMs ?? STARTUP_RESTORE_TIMEOUT_MS;
  const label = options.label ?? 'startup restore';
  const log = options.log ?? ((message: string, detail?: unknown) => console.warn(message, detail));
  let settled = false;
  return new Promise<StartupRestoreOutcome>((resolve) => {
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      log(`[${label}] still running after ${timeoutMs} ms; rendering without it`);
      resolve('timeout');
    }, timeoutMs);
    restore.then(
      () => {
        clearTimeout(timer);
        if (settled) {
          log(`[${label}] finished late (after first render)`);
          return;
        }
        settled = true;
        resolve('done');
      },
      (error: unknown) => {
        clearTimeout(timer);
        if (settled) {
          log(`[${label}] failed late (after first render):`, error);
          return;
        }
        settled = true;
        log(`[${label}] failed:`, error);
        resolve('failed');
      },
    );
  });
}
