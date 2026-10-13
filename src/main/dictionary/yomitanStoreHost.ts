// Electron wiring for Yomitan store provisioning: parse a zip and write its JSON
// store in the dictionary utility process, never on the main loop.
//
// Measured 2026-10-13 on the E2E app with an inspector on the main process:
// provisioning the three bundled stores (JMdict en/ru, Moedict) in-process held
// the main loop for ~14 s of parsing at first boot and left the heap at ~970 MB,
// ~890 MB of it garbage. The major GC that collected it came 20-30 s later and
// stopped the main process for 5-8 s — every IPC call, the debug bridge, and so
// every window waiting on the main process. In the utility process the parse,
// its peak memory and its garbage all end with the child.
//
// Same shape as `anki/apkgReadHost.ts`: an ack-bounded startup, and the
// in-process parse as the fallback when no child answers (tests, a broken
// package), because a slow first boot is better than no dictionary.

import { utilityProcess } from 'electron';
import { dictionaryImportWorkerPath } from './importJobs';
import {
  provisionYomitanStore,
  type ProvisionedYomitanStore,
  type YomitanProvisionReply,
  type YomitanProvisionRequest,
  type YomitanStoreOverrides,
} from './yomitanZip';

/** How long the child may take to say it has the request. Startup only, never the parse. */
export const YOMITAN_PROVISION_STARTUP_TIMEOUT_MS = 15_000;

function provisionInProcess(zipPath: string, outPath: string, overrides: YomitanStoreOverrides): Promise<ProvisionedYomitanStore> {
  try {
    return Promise.resolve(provisionYomitanStore(zipPath, outPath, overrides));
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Parse `zipPath` and write its store to `outPath` off the main process.
 * Resolves with the store's info and term count; rejects with the parse's own
 * message when the archive is not a usable dictionary.
 */
export function provisionYomitanStoreOffMainLoop(
  zipPath: string,
  outPath: string,
  overrides: YomitanStoreOverrides = {},
  opts: { startupTimeoutMs?: number } = {},
): Promise<ProvisionedYomitanStore> {
  let child: ReturnType<typeof utilityProcess.fork>;
  try {
    child = utilityProcess.fork(dictionaryImportWorkerPath(), [], {
      // Pure computation over files this process named: no network, no debug port.
      serviceName: 'jp-dictionary-provision',
      stdio: 'ignore',
    });
  } catch {
    // No utility process here (a test, or Electron without one): parse in place.
    return provisionInProcess(zipPath, outPath, overrides);
  }

  return new Promise<ProvisionedYomitanStore>((resolve, reject) => {
    let settled = false;
    let startupTimer: ReturnType<typeof setTimeout> | undefined;
    const disarmStartup = (): void => {
      if (startupTimer === undefined) return;
      clearTimeout(startupTimer);
      startupTimer = undefined;
    };
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      disarmStartup();
      try {
        child.kill();
      } catch {
        /* already gone */
      }
      fn();
    };
    // A child that died or never answered is not a bad dictionary: do the work here.
    const fallBackInProcess = (why: string): void => {
      console.warn(`[yomitan] provisioning process gave no answer (${why}); parsing on the main process`);
      provisionInProcess(zipPath, outPath, overrides).then(resolve, reject);
    };

    child.on('message', (value: unknown) => {
      const message = value as YomitanProvisionReply | undefined;
      if (!message || typeof message !== 'object') return;
      if (message.type === 'provisionYomitanAccepted') {
        disarmStartup();
        return;
      }
      if (message.type !== 'provisionYomitanResult') return;
      if (message.ok) {
        const { info, termCount } = message;
        finish(() => resolve({ info, termCount }));
      } else {
        const error = message.error;
        finish(() => reject(new Error(error)));
      }
    });
    // `fork()` on a missing module does not throw; the child exits instead.
    child.on('exit', (code: number) => finish(() => fallBackInProcess(`exit:${code}`)));

    try {
      child.postMessage({ type: 'provisionYomitan', zipPath, outPath, overrides } satisfies YomitanProvisionRequest);
      startupTimer = setTimeout(() => {
        startupTimer = undefined;
        finish(() => fallBackInProcess('no-ack'));
      }, opts.startupTimeoutMs ?? YOMITAN_PROVISION_STARTUP_TIMEOUT_MS);
      startupTimer.unref?.();
    } catch (error) {
      finish(() => fallBackInProcess(error instanceof Error ? error.message : String(error)));
    }
  });
}
