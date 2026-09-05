/**
 * The dev-server boot path clears Chromium's HTTP cache before the first
 * `loadURL`, so a stale renderer bundle cannot survive a rebuild. That clear runs
 * through the NETWORK SERVICE, which is a separate process — and when it crashes
 * during boot, `session.clearCache()` never settles. Not rejects: never settles.
 * `.finally()` is only reached on a settled promise, so `loadURL` is never called
 * and the window sits blank forever.
 *
 * OBSERVED LIVE, 2026-09-05, and it is why this file exists rather than being a
 * defensive guess. A relay turn restarted the dev app and got:
 *
 *     [29468:...:ERROR:...network_service_instance_impl.cc:703]
 *       Network service crashed or was terminated, restarting service.
 *
 * and then, for the whole life of the process, `/health` reporting
 * `{"title":"jp-study-app","url":"","visible":true,...}`. Main was healthy the
 * entire time — the debug bridge answered, `/mem` answered, the process was
 * `Responding: True` — so nothing looked broken except that the app never
 * appeared. A `/reload` could not rescue it either: there is no URL to reload
 * back to. The only recovery was killing the process and starting again.
 *
 * `.finally()` ALREADY HANDLES A REJECTION. The gap is exactly and only the
 * promise that never settles, so the fix is a race against a timer rather than
 * another `catch`. The cache clear is an optimisation; showing the app is not.
 *
 * Two things this deliberately guarantees, because both were live failure modes
 * in the same code:
 *   - `load` runs AT MOST ONCE. A clear that settles after the timeout must not
 *     load a second time on top of a window that is already showing the app.
 *   - `load` may decline to run. The old call site was
 *     `.finally(() => mainWindow!.loadURL(...))` — a non-null assertion on a
 *     module-level `let` that the `closed` handler sets to `null`. Quitting
 *     during boot therefore threw inside a `finally` with no handler. `load`
 *     returning without doing anything is a supported outcome here, and
 *     `loadReason` records which of the three paths got there.
 */

export type BootLoadReason = 'cleared' | 'clear-failed' | 'clear-timeout';

export interface BootLoadResult {
  /** Which of the three paths reached `load`. */
  reason: BootLoadReason;
  /** How long the clear was waited on, in ms, as the caller's clock saw it. */
  waitedMs: number;
}

/**
 * Run `clear`, then `load` — but never let `clear` be the reason the app does
 * not start. Resolves once `load` has been called.
 *
 * `timeoutMs` is a boot budget, not a guess at how long a cache clear takes: on
 * this machine a healthy clear settles in single-digit milliseconds, so any wait
 * approaching the budget already means the network service is not answering.
 */
export function loadAfterCacheClear(
  clear: () => Promise<unknown>,
  load: () => void,
  timeoutMs = 3000,
  now: () => number = () => Date.now(),
): Promise<BootLoadResult> {
  const started = now();
  let done = false;

  return new Promise<BootLoadResult>((resolve) => {
    const finish = (reason: BootLoadReason): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      load();
      resolve({ reason, waitedMs: now() - started });
    };

    // `unref` where it exists so a pending boot timer cannot hold the process
    // open; Electron's main process is Node, and the test environment is too.
    const timer: ReturnType<typeof setTimeout> = setTimeout(
      () => finish('clear-timeout'),
      timeoutMs,
    );
    (timer as unknown as { unref?: () => void }).unref?.();

    let started$: Promise<unknown>;
    try {
      started$ = clear();
    } catch {
      // A synchronous throw is the same outcome as a rejection: the cache was
      // not cleared, and the app still has to start.
      finish('clear-failed');
      return;
    }
    Promise.resolve(started$).then(
      () => finish('cleared'),
      () => finish('clear-failed'),
    );
  });
}
