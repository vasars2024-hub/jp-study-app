/**
 * The "Use AI features" master switch, as main's AI entry points see it.
 *
 * A registration rather than an import of the store, for the reason
 * `providerRuntime.ts` gives for its spend guard: the modules that consult this
 * are reachable from unit tests that never boot Electron, and a gate each of
 * them had to wire up would be skipped by the first one that forgot. `null`
 * until main registers the store at startup, which reads as "on" — the switch
 * existing must not change what a test or a pre-setting profile does.
 */

let reader: (() => boolean) | null = null;

export function setAiFeaturesReader(next: (() => boolean) | null): void {
  reader = next;
}

/** A switch that cannot be read is treated as on: failing closed would hide features the user chose. */
export function aiFeaturesEnabled(): boolean {
  if (!reader) return true;
  try {
    return reader();
  } catch {
    return true;
  }
}

/** Plain English for logs and the extension route; the renderer shows its own translated text. */
export const AI_FEATURES_OFF_MESSAGE = 'AI features are turned off. Turn them on in Settings > AI.';
