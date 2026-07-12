// Background probe loop owning the AnkiConnect connection state machine
// (SERVICES_PATCH.md 5.7). Probe = `version` + `deckNames` at FAST timeout.
// The internal DEGRADED state implements the anti-flicker debounce; the
// wire/UI type only ever sees checking | connected | disconnected.

import { app } from 'electron';
import { ANKI_UNREACHABLE_MSG, ANKI_COLLECTION_UNAVAILABLE_MSG } from '../../shared/anki';
import type { AnkiLinkState, AnkiLinkStatus } from '../../shared/anki';
import { FAST_TIMEOUT_MS, AnkiError, invoke, onTransportFailure } from './client';

type InternalState = 'unknown' | 'probing' | 'connected' | 'degraded' | 'disconnected';

const CONNECTED_PROBE_MS = 30000; // cadence while connected
const DISCONNECTED_PROBE_MS = 10000; // cadence while disconnected
const DEGRADED_RETRY_MS = 5000; // single fast retry after the first failure
/** Ignore stray call timeouts if a probe succeeded within this window. */
const RECENT_PROBE_GRACE_MS = 20000;
/** Retry while AnkiConnect is up but the collection isn't loaded yet. */
const COLLECTION_WAIT_PROBE_MS = 5000;

let state: InternalState = 'unknown';
let apiVersion: number | undefined;
let lastOkAt: number | undefined;
let lastProbeAt: number | undefined;
let consecutiveFailures = 0;
let waitingCollection = false;

let started = false;
let halted = false;
let probeInFlight = false;
let timer: NodeJS.Timeout | null = null;
let unsubscribeClient: (() => void) | null = null;

const pushListeners = new Set<(s: AnkiLinkStatus) => void>();
const connectedListeners = new Set<() => void>();

// ----- Public surface ---------------------------------------------------------

/**
 * Wire pushes, fired exactly per the H1..H9 push column (edges, not levels).
 * anki/index.ts forwards these to the renderer as `anki:linkChanged`.
 */
export function onWirePush(cb: (s: AnkiLinkStatus) => void): () => void {
  pushListeners.add(cb);
  return () => pushListeners.delete(cb);
}

/**
 * Fires on H2 (first connect) and H7 (reconnect) — the transitions that kick
 * an interval poll and invalidate field-map caches. NOT fired on H5
 * (degraded -> connected), which never visibly disconnected.
 */
export function onConnected(cb: () => void): () => void {
  connectedListeners.add(cb);
  return () => connectedListeners.delete(cb);
}

/** Cached status, served synchronously to `anki:linkState` and the shims. */
export function getLinkStatus(): AnkiLinkStatus {
  const wire = wireState();
  const status: AnkiLinkStatus = { state: wire, consecutiveFailures };
  if (waitingCollection) {
    status.waitingCollection = true;
    status.error = ANKI_COLLECTION_UNAVAILABLE_MSG;
  } else if (wire === 'disconnected') {
    status.error = ANKI_UNREACHABLE_MSG;
  }
  if (apiVersion !== undefined) status.apiVersion = apiVersion;
  if (lastOkAt !== undefined) status.lastOkAt = lastOkAt;
  if (lastProbeAt !== undefined) status.lastProbeAt = lastProbeAt;
  return status;
}

/**
 * AnkiConnect answered but deck/collection APIs failed — enter wait/retry mode
 * instead of treating this as a transport disconnect.
 */
export function notifyCollectionUnavailable(): void {
  if (halted || !started) return;
  applyWaitingCollection(apiVersion);
}

/** H1: immediate first probe; subsequent cadence is state-driven. Idempotent. */
export function startHeartbeat(): void {
  if (started) return;
  started = true;
  halted = false;
  // H8: transport failures from ordinary calls fast-path the FSM, but only
  // when we haven't had a successful probe recently — bulk interval polls and
  // slow deck list fetches shouldn't flicker the UI to "disconnected".
  unsubscribeClient = onTransportFailure(() => {
    if (lastOkAt != null && Date.now() - lastOkAt < RECENT_PROBE_GRACE_MS) return;
    applyFailure();
  });
  app.once('before-quit', stopHeartbeat); // H9
  state = 'probing';
  push(); // { state: 'checking' }
  void probe();
}

/** H9: clear the timer and stop probing. */
export function stopHeartbeat(): void {
  halted = true;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (unsubscribeClient) {
    unsubscribeClient();
    unsubscribeClient = null;
  }
  started = false;
}

/**
 * Ask for an immediate probe (used by the anki:status shim after a manual
 * "Retry" reaches Anki while the cached state still says disconnected, so the
 * FSM catches up without waiting out the 10 s cadence).
 */
export function pokeProbe(): void {
  if (!started || halted || probeInFlight) return;
  void probe();
}

// ----- Internals ---------------------------------------------------------------

function wireState(): AnkiLinkState {
  if (state === 'connected' || state === 'degraded') return 'connected';
  if (state === 'disconnected') return 'disconnected';
  return 'checking';
}

function push(): void {
  const snapshot = getLinkStatus();
  for (const cb of Array.from(pushListeners)) {
    try {
      cb(snapshot);
    } catch (err) {
      console.error('[anki] heartbeat push listener threw:', err);
    }
  }
}

function fireConnected(): void {
  for (const cb of Array.from(connectedListeners)) {
    try {
      cb();
    } catch (err) {
      console.error('[anki] heartbeat connected listener threw:', err);
    }
  }
}

function scheduleNext(ms: number): void {
  if (halted) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void probe();
  }, ms);
}

async function probe(): Promise<void> {
  if (halted || probeInFlight) return;
  probeInFlight = true;
  lastProbeAt = Date.now();
  try {
    const version = await invoke('version', undefined, {
      timeoutMs: FAST_TIMEOUT_MS,
      quiet: true,
    });
    try {
      await invoke('deckNames', undefined, { timeoutMs: FAST_TIMEOUT_MS, quiet: true });
      probeInFlight = false;
      applySuccess(version);
    } catch (err) {
      probeInFlight = false;
      if (err instanceof AnkiError && err.kind === 'collection') {
        applyWaitingCollection(version);
        return;
      }
      waitingCollection = false;
      applyFailure();
    }
  } catch {
    probeInFlight = false;
    waitingCollection = false;
    applyFailure();
  }
}

function applyWaitingCollection(version?: number): void {
  if (halted) return;
  const wasWaiting = waitingCollection;
  if (version !== undefined) apiVersion = version;
  waitingCollection = true;
  consecutiveFailures = 0;
  state = 'probing';
  scheduleNext(COLLECTION_WAIT_PROBE_MS);
  if (!wasWaiting) push();
}

function applySuccess(version: number): void {
  if (halted) return;
  const prev = state;
  const wasWaiting = waitingCollection;
  apiVersion = version;
  lastOkAt = Date.now();
  consecutiveFailures = 0;
  waitingCollection = false;
  state = 'connected';
  scheduleNext(CONNECTED_PROBE_MS);
  if (prev === 'degraded' || prev === 'connected') return; // H5: no push, state never visibly changed
  push(); // H2 / H7 / collection-ready
  if (wasWaiting || prev === 'probing' || prev === 'disconnected' || prev === 'unknown') {
    fireConnected();
  }
}

function applyFailure(): void {
  if (halted || !started) return;
  waitingCollection = false;
  const prev = state;
  if (prev === 'connected') {
    // H4: first consecutive failure — silent fast retry, no push.
    consecutiveFailures = 1;
    state = 'degraded';
    scheduleNext(DEGRADED_RETRY_MS);
    return;
  }
  consecutiveFailures += 1;
  if (prev === 'degraded') {
    // H6: second consecutive failure — now visibly disconnected.
    state = 'disconnected';
    scheduleNext(DISCONNECTED_PROBE_MS);
    push();
    return;
  }
  // H3 (probing) or repeat failures while already disconnected.
  const wasDisconnected = prev === 'disconnected';
  state = 'disconnected';
  scheduleNext(DISCONNECTED_PROBE_MS);
  if (!wasDisconnected) push();
}
