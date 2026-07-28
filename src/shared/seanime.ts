/**
 * Seanime sidecar — shared contract (Phase 1, read-only proof).
 *
 * The whole feature is gated behind SEANIME_SIDECAR_ENABLED. It is off unless the
 * env flag is set, so a normal run of Study OS never spawns the sidecar and never
 * touches its data. Rollback is this flag plus deleting the temp datadir.
 */

/** Dev-only gate. Set SEANIME_SIDECAR=1 to arm the Phase-1 sidecar. */
export const SEANIME_SIDECAR_ENABLED =
  typeof process !== 'undefined' && process.env?.SEANIME_SIDECAR === '1';

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
  /** Populated on `failed` / `offline`. */
  error: string | null;
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

export const SEANIME_CHANNELS = {
  status: 'seanime:status',
  start: 'seanime:start',
  stop: 'seanime:stop',
  probe: 'seanime:probe',
  connection: 'seanime:connection',
  statusEvent: 'seanime:statusEvent',
} as const;
