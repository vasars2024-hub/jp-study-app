/**
 * The VideoCore player's live state, for Player Diagnostics (round-2 audit B).
 *
 * The diagnostics run from the Media Center's settings, which does not hold the
 * player's element, playback info or tracks — the study overlay does. The
 * overlay registers a reader here while it is mounted; the diagnostics call it.
 * Nothing registered means nothing is playing in this window, which the report
 * says as such rather than probing an empty element.
 */
import type { LivePlayerSnapshot } from '../shared/playerDiagnostics';

let reader: (() => LivePlayerSnapshot | null) | null = null;

export function registerLivePlayerProbe(next: () => LivePlayerSnapshot | null): () => void {
  reader = next;
  return () => {
    if (reader === next) reader = null;
  };
}

export function readLivePlayerSnapshot(): LivePlayerSnapshot | null {
  try {
    return reader?.() ?? null;
  } catch {
    return null;
  }
}
