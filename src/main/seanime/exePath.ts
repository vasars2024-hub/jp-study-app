/**
 * Where `seanime.exe` comes from.
 *
 * This used to be one line in `supervisor.ts`: the `SEANIME_EXE` env var with a
 * fallback to an **absolute path inside one developer's home directory**, baked
 * into shipped main-process code. It worked only because every Phase 1–5 proof ran
 * on that machine, and it is one of the two concrete things standing between the
 * passed G-PLAY gate and actually retiring the old player (the other is a durable
 * datadir — see `docs/migration/NEXT_SESSION.md`, "What old-player retirement
 * really needs"). `seanimeExePath.test.ts` now fails if such a literal reappears
 * in either file, which is why this note describes it instead of quoting it.
 *
 * Resolution order, and why:
 *  1. `SEANIME_EXE` — always wins, even when the file is absent, because every
 *     proof harness points it at a purpose-built binary and a silent fallback to
 *     a different exe would invalidate the run. An absent override must fail
 *     loudly, naming itself.
 *  2. Packaged: `<resourcesPath>/seanime/seanime.exe`. Nothing ships there yet —
 *     `forge.config.ts` has `extraResource: ['public']` only — so this is the
 *     slot packaging has to fill, named here so the requirement is discoverable
 *     from the code that needs it.
 *  3. Dev: the pinned sibling checkout, derived from the app path rather than a
 *     hardcoded home. `<appPath>/../seanime-upstream/seanime.exe`.
 *
 * Kept free of `electron` and `fs` imports so it is directly testable: the caller
 * supplies the environment and an existence predicate.
 */

import path from 'node:path';

export interface SeanimeExeContext {
  /** `process.env.SEANIME_EXE`, untrimmed. */
  envOverride?: string | undefined;
  /** `app.isPackaged`. */
  isPackaged: boolean;
  /** `process.resourcesPath` — only meaningful when packaged. */
  resourcesPath?: string | undefined;
  /** `app.getAppPath()`. */
  appPath: string;
}

export interface SeanimeExeResolution {
  /** The path to spawn, or to name in the error when it does not exist. */
  exePath: string;
  /** Which rule chose it. */
  source: 'env' | 'packaged-resource' | 'dev-sibling-checkout';
  /** Every candidate considered, in order — for an error message worth reading. */
  candidates: string[];
  /** Whether `exePath` exists according to the supplied predicate. */
  exists: boolean;
}

/** The sibling directory holding the pinned upstream checkout in a dev tree. */
export const DEV_SIBLING_CHECKOUT = 'seanime-upstream';
/** The subdirectory packaging must place the binary in. */
export const PACKAGED_RESOURCE_DIR = 'seanime';
const EXE_NAME = 'seanime.exe';

export function resolveSeanimeExe(
  context: SeanimeExeContext,
  exists: (candidate: string) => boolean,
): SeanimeExeResolution {
  const override = context.envOverride?.trim();
  if (override) {
    return {
      exePath: override,
      source: 'env',
      candidates: [override],
      exists: exists(override),
    };
  }

  const candidates: string[] = [];
  if (context.isPackaged && context.resourcesPath) {
    candidates.push(path.join(context.resourcesPath, PACKAGED_RESOURCE_DIR, EXE_NAME));
  }
  candidates.push(path.join(context.appPath, '..', DEV_SIBLING_CHECKOUT, EXE_NAME));

  for (const candidate of candidates) {
    if (exists(candidate)) {
      return {
        exePath: candidate,
        source:
          context.isPackaged && candidate.includes(PACKAGED_RESOURCE_DIR)
            ? 'packaged-resource'
            : 'dev-sibling-checkout',
        candidates,
        exists: true,
      };
    }
  }

  // Nothing found. Report the last candidate as the path, so the message points
  // at the dev location a developer can actually populate, and list them all.
  return {
    exePath: candidates[candidates.length - 1] ?? EXE_NAME,
    source: context.isPackaged ? 'packaged-resource' : 'dev-sibling-checkout',
    candidates,
    exists: false,
  };
}

/** The message the supervisor reports when nothing was found. */
export function seanimeExeMissingMessage(resolution: SeanimeExeResolution): string {
  if (resolution.source === 'env') {
    return `seanime.exe not found at ${resolution.exePath} (from SEANIME_EXE)`;
  }
  return `seanime.exe not found. Tried: ${resolution.candidates.join(', ')}`;
}
