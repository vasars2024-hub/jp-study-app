// Renderer mirror of the main-process Noctis CityService (ARCHITECTURE.md
// Section 3). House pattern of profileState.ts: module-level cache + a
// CustomEvent, refreshed by push. The main process is the sole writer of
// civilization state; this module only ever reads snapshots and relays the
// one inbound channel (already-interpreted sessions) over IPC.

import type { CitySessionPacket, CityStateMessage } from '../main/city/ipc/channels';

export const CITY_EVENT = 'city-changed';

let snapshot: CityStateMessage | null = null;
let initPromise: Promise<void> | null = null;

function applySnapshot(next: CityStateMessage): void {
  if (snapshot && next.state.revision < snapshot.state.revision) return;
  snapshot = next;
  window.dispatchEvent(new CustomEvent<CityStateMessage>(CITY_EVENT, { detail: next }));
}

/** Synchronous cached read. Null until initCityState() resolves its first snapshot. */
export function getCityState(): CityStateMessage | null {
  return snapshot;
}

export function onCityChanged(cb: (message: CityStateMessage) => void): () => void {
  const handler = (e: Event): void => cb((e as CustomEvent<CityStateMessage>).detail);
  window.addEventListener(CITY_EVENT, handler);
  return () => window.removeEventListener(CITY_EVENT, handler);
}

/**
 * Send an already-interpreted learning session to the main process. The
 * membrane crossing (TelemetryWindow -> InterpretedLearningInput) happens in
 * citySession.ts before this call, so no raw telemetry, book title, or word
 * ever reaches IPC (LEARNING_INTEGRATION.md Section 9).
 */
export async function recordCitySession(packet: CitySessionPacket): Promise<CityStateMessage> {
  const res = await window.api.cityRecordSession(packet);
  applySnapshot(res);
  return res;
}

/** Boot: subscribe to pushes, then fetch the current snapshot. */
export function initCityState(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      // Subscribed before the handshake so a push racing it is never missed.
      window.api.onCityChanged((message) => applySnapshot(message));
      let delay = 1000;
      for (;;) {
        try {
          const got = await window.api.cityGetState();
          applySnapshot(got);
          return;
        } catch {
          await new Promise<void>((resolve) => window.setTimeout(resolve, delay));
          delay = Math.min(10000, delay * 2);
        }
      }
    })();
  }
  return initPromise;
}
