/**
 * Seanime sidecar — shared contract.
 *
 * The whole feature is gated behind SEANIME_SIDECAR_ENABLED. Through Phases 1–6 it was
 * off unless `SEANIME_SIDECAR=1`, so a normal run never spawned the sidecar. It is now
 * **on by default** — see the flag below. Rollback is `SEANIME_SIDECAR=0`.
 */

/**
 * Sidecar gate. **Default ON since 2026-07-31** (old-player retirement).
 *
 * It read `=== '1'` while default-on was unsafe, and both reasons are now closed:
 * the binary ships with the package (`forge.config.ts`'s staging plugin, which *fails*
 * the build rather than shipping a dead media surface) and the datadir is durable
 * (`main/seanime/dataDir.ts`), so a normal run no longer comes up `failed` on other
 * machines or re-scans into a throwaway directory on this one. A packaged start was
 * then watched reaching `ready` from the packaged slot
 * (`docs/migration/proof/packaged-sidecar-launch-20260731102252/`).
 *
 * **Set `SEANIME_SIDECAR=0` to opt out.** That is the rollback for this flip, and `=1`
 * still works so every existing harness and recipe keeps its meaning.
 *
 * Turning this on does **not** spawn anything at boot: nothing calls `startSeanime()`
 * eagerly, so the only effect is that the initial status is `stopped` rather than
 * `disabled` and the media surface becomes reachable.
 *
 * **Only the main process reads this.** The renderer gates on the reported
 * `SeanimeStatus.kind !== 'disabled'` (`media/MediaWorkspaceHost.tsx:177`), which main
 * derives from this flag — one source of truth, and the renderer needs no `process.env`.
 * That is why a context where `process` is absent reads `false` here: it is never the
 * value anything acts on, and `false` is the safe direction.
 */
export const SEANIME_SIDECAR_OPT_OUT_VALUES = ['0', 'false', 'off'] as const;

/**
 * Pure form of the gate, so the semantics are testable without re-importing this module
 * under a mutated `process.env`. `raw` is the unparsed `SEANIME_SIDECAR` value.
 *
 * Three spellings opt out rather than only `0`, because `SEANIME_SIDECAR=false` is the
 * obvious thing to type and silently getting an *enabled* sidecar from it would be the
 * worst kind of surprise — the rollback would look applied and not be. An empty value is
 * treated as unset, matching how `forge.config.ts` reads its own sidecar env.
 */
export function seanimeSidecarEnabledFrom(raw: string | undefined): boolean {
  const value = raw?.trim().toLowerCase();
  if (!value) return true;
  return !(SEANIME_SIDECAR_OPT_OUT_VALUES as readonly string[]).includes(value);
}

export const SEANIME_SIDECAR_ENABLED =
  typeof process !== 'undefined' && seanimeSidecarEnabledFrom(process.env?.SEANIME_SIDECAR);

/**
 * Lifecycle of the sidecar process. `failed` and `offline` are explicit terminal
 * states so the UI can say what went wrong instead of spinning forever.
 */
export type SeanimeStatusKind =
  | 'disabled'
  | 'stopped'
  | 'starting'
  | 'ready'
  | 'offline'
  | 'failed';

/**
 * Sidecar failure codes (resilience audit #14): `missing-exe` → install,
 * `crashed` → restart, the rest → retry. `disabled` is an explicit opt-out.
 */
export type SeanimeFailureCode = 'disabled' | 'missing-exe' | 'port' | 'spawn-failed' | 'unhealthy' | 'crashed';

/** The i18n key that explains a sidecar failure in the UI language. */
export function seanimeFailureKey(code: SeanimeFailureCode | null | undefined): string | null {
  return code ? `mediaWorkspace.failure.${code}` : null;
}

export interface SeanimeStatus {
  kind: SeanimeStatusKind;
  /** Loopback port once bound; 0 before that. */
  port: number;
  /** OS pid of seanime.exe while it is alive. */
  pid: number | null;
  /** Isolated datadir the sidecar was given. Never a Study OS path. */
  dataDir: string | null;
  /** Server version reported by /api/v1/status. */
  version: string | null;
  /** True when the server is running without an AniList account (simulated user). */
  simulatedUser: boolean | null;
  /**
   * Populated on `failed` / `offline`. A raw diagnostic (English, paths,
   * exit codes) — shown only as an optional details line; the UI words the
   * failure from `errorCode`.
   */
  error: string | null;
  /** Why the sidecar is not running, for a translated message and recovery. */
  errorCode?: SeanimeFailureCode | null;
  /** Last few lines of server stderr/stdout, for diagnosing a failed start. */
  logTail: string[];
}

/** One poster tile in the Phase-1 dev grid. */
export interface SeanimePosterTile {
  /** AniList media id — the external identity column, never a Study OS id. */
  anilistId: number;
  malId: number | null;
  title: string;
  posterUrl: string | null;
  /** Local files mapped to this title by the scanner. */
  fileCount: number;
}

/** Proof payload for the acceptance criterion "identity mapping shown for one title". */
export interface SeanimeIdentityRow {
  anilistId: number;
  malId: number | null;
  title: string;
  /** Episode number as the scanner resolved it (season-relative). */
  episode: number | null;
  path: string;
}

export interface SeanimeProbeResult {
  status: SeanimeStatus;
  tiles: SeanimePosterTile[];
  identity: SeanimeIdentityRow[];
  /** Files the scanner could not map to any AniList id. */
  unmatchedFiles: number;
  totalFiles: number;
}

/**
 * What the adopted Media workspace needs in order to talk to the sidecar directly.
 *
 * Phase 1's dev panel went through IPC for each call. The adopted seanime-web source
 * has its own axios + react-query client, so Phase 2 hands the renderer the loopback
 * base URL and auth token once and lets that client do the talking. The sidecar binds
 * an ephemeral port and a fresh random password per spawn, so neither value can be
 * baked in — both are only knowable at runtime.
 */
export interface SeanimeConnection {
  /** e.g. `http://127.0.0.1:51873`. Empty string when the sidecar is not running. */
  baseUrl: string;
  /** Value for the `X-Seanime-Token` header: sha256 hex of the generated password. */
  token: string;
}

export interface SeanimeHeartbeatState {
  awaitingPong: boolean;
  missedPongs: number;
}

export interface SeanimeHeartbeatTick {
  state: SeanimeHeartbeatState;
  shouldReconnect: boolean;
}

/**
 * Advance heartbeat state by one interval that actually ran.
 *
 * This deliberately accepts no clock value: a suspended/throttled renderer must not turn
 * elapsed wall time into missed pongs for ping callbacks that never executed.
 */
export function advanceSeanimeHeartbeat(
  state: Readonly<SeanimeHeartbeatState>,
  maxMissedPongs = 3,
): SeanimeHeartbeatTick {
  const missedPongs = state.awaitingPong ? state.missedPongs + 1 : 0;
  return {
    state: { awaitingPong: true, missedPongs },
    shouldReconnect: missedPongs >= Math.max(1, maxMissedPongs),
  };
}

export function acknowledgeSeanimePong(): SeanimeHeartbeatState {
  return { awaitingPong: false, missedPongs: 0 };
}

export const SEANIME_CHANNELS = {
  status: 'seanime:status',
  start: 'seanime:start',
  stop: 'seanime:stop',
  probe: 'seanime:probe',
  connection: 'seanime:connection',
  extractAudio: 'seanime:extractAudio',
  statusEvent: 'seanime:statusEvent',
  /** Phase 6: the read-only Seanime library projection for Study Mode. */
  studyLibrary: 'seanime:studyLibrary',
} as const;
