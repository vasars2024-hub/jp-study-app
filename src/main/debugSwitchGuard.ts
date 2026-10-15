/**
 * A shipped Gum does not open a remote-debugging door.
 *
 * Chromium reads `--remote-debugging-port=<n>` / `--remote-debugging-pipe` from the
 * command line and, once the app is ready, serves DevTools over it: anything that can
 * reach the port (or launch Gum with the pipe) can read and drive every window, the
 * lock screen's included, and read the profile's cookies and storage. A packaged
 * build has no reason to accept that, so main strips both switches before `ready`,
 * which is when Electron starts the DevTools handler. If a switch somehow survives
 * the strip, the app refuses to start rather than run with it.
 *
 * Unpackaged runs keep them: `npm start` for the developer, and the end-to-end
 * harness, which launches the unpackaged app (`tools/e2e/run.cjs`) and talks to it
 * over its own bridge (`main/e2eHeadless.ts`), never over remote debugging. A
 * packaged `--e2e` run gets no exemption: the flag is on a command line anyone can
 * type, so it cannot be what opens the port.
 *
 * No `electron` import: the command line is passed in, so the guard runs under
 * plain vitest. main.ts hands it `app.commandLine`.
 */

/** Chromium switches (without the leading `--`) that open DevTools to another process. */
export const REMOTE_DEBUG_SWITCHES = ['remote-debugging-port', 'remote-debugging-pipe', 'remote-debugging-address'] as const;

export interface CommandLineLike {
  hasSwitch(name: string): boolean;
  removeSwitch(name: string): void;
}

export interface DebugSwitchGuardInput {
  isPackaged: boolean;
  commandLine: CommandLineLike;
  /** `process.argv`, for switches Chromium has not parsed into `commandLine`. */
  argv?: readonly string[];
  log?(message: string): void;
}

export type DebugSwitchGuardResult =
  /** Unpackaged (dev, the e2e harness): nothing checked. */
  | { action: 'allowed' }
  /** Packaged: these switches were present and are gone. */
  | { action: 'stripped'; switches: string[] }
  /** Packaged: a switch would not come off; the caller must not start. */
  | { action: 'refuse'; switches: string[] }
  /** Packaged, and nothing to strip. */
  | { action: 'clean' };

function inArgv(argv: readonly string[], name: string): boolean {
  const flag = `--${name}`;
  return argv.some((a) => a === flag || a.startsWith(`${flag}=`));
}

export function guardDebugSwitches(input: DebugSwitchGuardInput): DebugSwitchGuardResult {
  if (!input.isPackaged) return { action: 'allowed' };
  const argv = input.argv ?? [];
  const found = REMOTE_DEBUG_SWITCHES.filter((name) => {
    try {
      return input.commandLine.hasSwitch(name) || inArgv(argv, name);
    } catch {
      return inArgv(argv, name);
    }
  });
  if (!found.length) return { action: 'clean' };
  const stuck: string[] = [];
  for (const name of found) {
    try {
      input.commandLine.removeSwitch(name);
      if (input.commandLine.hasSwitch(name)) stuck.push(name);
    } catch {
      stuck.push(name);
    }
  }
  if (stuck.length) {
    input.log?.(`refusing to start: could not remove --${stuck.join(', --')}`);
    return { action: 'refuse', switches: stuck };
  }
  input.log?.(`ignored --${found.join(', --')} (a packaged build does not allow remote debugging)`);
  return { action: 'stripped', switches: [...found] };
}
