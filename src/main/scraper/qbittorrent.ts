// qBittorrent WebUI API client (v2).
//
// Three operations the Torrent Manager needs: prove the connection works, show
// what is transferring, and hand over a magnet. The API is cookie-session
// based — POST /api/v2/auth/login returns an SID cookie that every later call
// must carry — so this module keeps one cookie per host and re-logs-in when it
// expires.
//
// The password never comes from settings. It is read from the credential vault
// by the ref the settings hold, or passed in for a "test before saving" flow,
// and it is never logged: the log bus redacts credential patterns, and nothing
// here builds a line containing one.

import { URLSearchParams } from 'node:url';
import type {
  QbitSendReport,
  QbitStatusReport,
  QbitTransferRow,
  TorrentRow,
} from '../../shared/scraperResults';
import type {
  ScraperQbitAuthMode,
  ScraperQbittorrentSettings,
  ScraperSettingsIssue,
} from '../../shared/scraperSourceSettings';
import {
  DEFAULT_SCRAPER_QBITTORRENT_SETTINGS,
  validateScraperQbittorrentSettings,
} from '../../shared/scraperSourceSettings';
import type { ScraperQbitInput, ScraperQbitSendInput } from '../../shared/scraperIpc';
import { getScraperSecret } from './credentials';
import { scraperRequest } from './http';
import { scraperLog } from './logBus';

const TIMEOUT_MS = 12_000;

/**
 * Live sessions, keyed by base URL. Cleared when a call comes back 403.
 *
 * The mode is stored beside the cookie because a user who switches from
 * password to key auth would otherwise keep riding the old SID until the app
 * restarts — the switch would look like it worked no matter what the new
 * credential is.
 */
const sessions = new Map<string, { mode: ScraperQbitAuthMode; cookie: string }>();

/** The cookie for this base URL, but only if it was minted in `mode`. */
function sessionCookie(base: string, mode: ScraperQbitAuthMode): string {
  const held = sessions.get(base);
  if (!held) return '';
  if (held.mode !== mode) {
    sessions.delete(base);
    return '';
  }
  return held.cookie;
}

/**
 * The config as it crosses IPC is renderer-supplied and typed, not proven.
 *
 * A payload missing fields used to reach `qbitBaseUrl` intact and produce
 * `undefined://undefined:undefined/undefined` in a user-facing message, and
 * `buildAddForm` read `.tags.length` off a config without `tags` and rejected
 * across IPC with a raw TypeError. Both are the same gap, so both are closed at
 * the same place: every entry point runs the payload through the very validator
 * persistence already uses, which is total and a fixed point on its own output —
 * a real saved profile passes through unchanged.
 */
export function normalizeQbitInput<T extends ScraperQbitInput>(input: T): T {
  const source: unknown = input && typeof input === 'object' ? input : {};
  const issues: ScraperSettingsIssue[] = [];
  const config = validateScraperQbittorrentSettings(
    (source as ScraperQbitInput).config,
    DEFAULT_SCRAPER_QBITTORRENT_SETTINGS,
    issues,
    'qbittorrent',
  );
  if (issues.length) {
    scraperLog(
      'warn',
      'qbit',
      `Repaired ${issues.length} bad field(s) in the qBittorrent settings: `
        + issues.map((issue) => issue.path).join(', '),
    );
  }
  return { ...(source as T), config };
}

export function qbitBaseUrl(config: ScraperQbittorrentSettings): string {
  return `${config.scheme}://${config.host}:${config.port}${config.basePath}`;
}

/** qBittorrent's raw state strings, collapsed onto the vocabulary the UI has. */
export function mapQbitState(state: string): QbitTransferRow['state'] {
  switch (state) {
    case 'downloading':
    case 'forcedDL':
    case 'metaDL':
      return 'downloading';
    case 'uploading':
    case 'forcedUP':
      return 'seeding';
    case 'pausedDL':
    case 'pausedUP':
    case 'stoppedDL':
    case 'stoppedUP':
      return 'paused';
    case 'queuedDL':
    case 'queuedUP':
      return 'queued';
    case 'checkingDL':
    case 'checkingUP':
    case 'checkingResumeData':
    case 'moving':
      return 'checking';
    case 'stalledDL':
    case 'stalledUP':
      return 'stalled';
    case 'error':
    case 'missingFiles':
      return 'error';
    default:
      return 'queued';
  }
}

interface QbitTorrentInfo {
  hash?: string;
  name?: string;
  state?: string;
  progress?: number;
  dlspeed?: number;
  upspeed?: number;
  eta?: number;
  ratio?: number;
  category?: string;
  tags?: string;
  save_path?: string;
  size?: number;
  downloaded?: number;
  uploaded?: number;
  added_on?: number;
  completion_on?: number;
  num_leechs?: number;
  num_incomplete?: number;
  num_seeds?: number;
  num_complete?: number;
  availability?: number;
}

/** qBittorrent reports 8640000 for "unknown ETA"; the UI wants null. */
function etaOf(seconds: number | undefined): number | null {
  if (seconds === undefined || seconds >= 8_640_000 || seconds < 0) return null;
  return seconds;
}

function unixToIso(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return '';
  return new Date(seconds * 1_000).toISOString();
}

export function mapTransfer(info: QbitTorrentInfo): QbitTransferRow {
  const progress = Math.max(0, Math.min(1, info.progress ?? 0));
  return {
    hash: info.hash ?? '',
    name: info.name ?? '',
    state: mapQbitState(info.state ?? ''),
    progress,
    downloadSpeedBps: info.dlspeed ?? 0,
    uploadSpeedBps: info.upspeed ?? 0,
    etaSec: etaOf(info.eta),
    ratio: Math.max(0, info.ratio ?? 0),
    category: info.category ?? '',
    tags: (info.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean),
    savePath: info.save_path ?? '',
    sizeBytes: info.size ?? 0,
    downloadedBytes: info.downloaded ?? 0,
    uploadedBytes: info.uploaded ?? 0,
    addedOn: unixToIso(info.added_on),
    completedOn: info.completion_on && info.completion_on > 0
      ? unixToIso(info.completion_on)
      : null,
    peersConnected: info.num_leechs ?? 0,
    peersTotal: info.num_incomplete ?? 0,
    seedsConnected: info.num_seeds ?? 0,
    seedsTotal: info.num_complete ?? 0,
    availability: Math.max(0, info.availability ?? 0),
    // The per-piece strip needs /api/v2/torrents/pieceStates per torrent, which
    // is one request each; the list view approximates it from progress and the
    // detail view can fetch the real thing when it is built.
    pieceStates: [],
    // Set by the caller when it knows which episode a transfer belongs to.
    episodeId: null,
  };
}

async function resolvePassword(input: ScraperQbitInput): Promise<string> {
  if (input.password) return input.password;
  return getScraperSecret(input.config.passwordRef);
}

/** `password` for anything stored before the key mode existed. */
function authModeOf(config: ScraperQbittorrentSettings): ScraperQbitAuthMode {
  return config.authMode === 'apiKey' ? 'apiKey' : 'password';
}

async function resolveApiKey(input: ScraperQbitInput): Promise<string> {
  if (input.apiKey) return input.apiKey;
  return getScraperSecret(input.config.apiKeyRef);
}

/**
 * A key is rejected here rather than by the daemon when it cannot possibly be
 * one: no network call, and the reason names the shape rather than echoing the
 * value. Header values cannot carry CR/LF or a stray space without either being
 * refused by the HTTP layer or splitting the header, so those are the checks.
 */
function apiKeyProblem(key: string): string {
  if (!key) return 'No API key is stored for this connection.';
  if (key !== key.trim()) return 'The stored API key has leading or trailing whitespace.';
  // Scanned by code point rather than by regex: a character class spelling out
  // the C0 range trips `no-control-regex`, and the codes say the intent anyway.
  for (const char of key) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x20 || code === 0x7f) {
      return 'The stored API key contains a space or control character, so it is not a usable key.';
    }
  }
  return '';
}

interface LoginResult {
  ok: boolean;
  cookie: string;
  status: QbitStatusReport['status'];
  message: string;
  latencyMs: number;
}

async function login(config: ScraperQbittorrentSettings, password: string): Promise<LoginResult> {
  const base = qbitBaseUrl(config);
  const started = Date.now();
  try {
    const response = await scraperRequest(`${base}/api/v2/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        // qBittorrent rejects cross-origin posts unless Referer matches.
        referer: base,
      },
      body: new URLSearchParams({ username: config.username, password }).toString(),
      timeoutMs: TIMEOUT_MS,
      followRedirects: false,
      exposeSetCookie: true,
      correlationId: 'qbit',
    });
    const latencyMs = Date.now() - started;

    if (response.status === 403) {
      return {
        ok: false,
        cookie: '',
        status: 'unauthorized',
        message: 'qBittorrent banned this client after too many failed logins.',
        latencyMs,
      };
    }
    // Measured against a real 5.2.3 daemon on 2026-08-15: a wrong password
    // answers **401**, not the older `200 Ok./Fails.` pair. Without this branch
    // every wrong password fell through to "unreachable" below and told the user
    // to check their host and port while the credential was the problem.
    if (response.status === 401) {
      return {
        ok: false,
        cookie: '',
        status: 'unauthorized',
        message: 'The username or password was rejected.',
        latencyMs,
      };
    }
    if (response.status !== 200) {
      return {
        ok: false,
        cookie: '',
        status: 'unreachable',
        message: `qBittorrent answered ${response.status} to the login.`,
        latencyMs,
      };
    }
    if (response.body.trim() !== 'Ok.') {
      return {
        ok: false,
        cookie: '',
        status: 'unauthorized',
        message: 'The username or password was rejected.',
        latencyMs,
      };
    }
    // The cookie was redacted on the way through the HTTP layer, so it is read
    // from the raw header set here instead. `scraperRequest` keeps the SID out
    // of every log line — this is the one place it is needed.
    const cookie = response.rawSetCookie ?? '';
    const sid = /SID=([^;]+)/.exec(cookie)?.[0] ?? '';
    if (!sid) {
      return {
        ok: false,
        cookie: '',
        status: 'unknown',
        message: 'Login succeeded but qBittorrent set no session cookie.',
        latencyMs,
      };
    }
    sessions.set(base, { mode: 'password', cookie: sid });
    return { ok: true, cookie: sid, status: 'connected', message: '', latencyMs };
  } catch (error) {
    return {
      ok: false,
      cookie: '',
      status: 'unreachable',
      message: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - started,
    };
  }
}

/**
 * The one accepted key header, measured rather than guessed.
 *
 * Against a real daemon under `WebUI\LocalHostAuth=true` with a no-credential
 * 403 control passing, `Authorization: Bearer <key>` returned 200 and
 * `X-Api-Key` returned 403. Do not add the second one back "for compatibility".
 */
export function apiKeyHeaders(key: string): Record<string, string> {
  return { authorization: `Bearer ${key}` };
}

/**
 * An authorized request, retrying once through a fresh login on a 403.
 *
 * The retry belongs to password mode only. A key does not expire and is not
 * held in a session, so a 403 there means the key itself is wrong — retrying
 * would turn a definite answer into a slow one and read as a flake.
 */
async function authed(
  input: ScraperQbitInput,
  path: string,
  init: { method?: string; body?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: string } | { error: LoginResult }> {
  const base = qbitBaseUrl(input.config);
  const mode = authModeOf(input.config);

  const send = async (auth: Record<string, string>) =>
    scraperRequest(`${base}${path}`, {
      method: init.method ?? 'GET',
      headers: { ...auth, referer: base, ...init.headers },
      body: init.body,
      timeoutMs: TIMEOUT_MS,
      correlationId: 'qbit',
    });

  if (mode === 'apiKey') {
    const key = await resolveApiKey(input);
    const problem = apiKeyProblem(key);
    if (problem) {
      return { error: { ok: false, cookie: '', status: 'unauthorized', message: problem, latencyMs: 0 } };
    }
    try {
      const response = await send(apiKeyHeaders(key));
      if (response.status === 403) {
        return {
          error: {
            ok: false,
            cookie: '',
            status: 'unauthorized',
            message: 'qBittorrent rejected the API key.',
            latencyMs: 0,
          },
        };
      }
      return { status: response.status, body: response.body };
    } catch (error) {
      return {
        error: {
          ok: false,
          cookie: '',
          status: 'unreachable',
          message: error instanceof Error ? error.message : String(error),
          latencyMs: 0,
        },
      };
    }
  }

  const password = await resolvePassword(input);
  let cookie = sessionCookie(base, 'password');
  if (!cookie) {
    const result = await login(input.config, password);
    if (!result.ok) return { error: result };
    cookie = result.cookie;
  }

  try {
    let response = await send({ cookie });
    if (response.status === 403) {
      // The session expired or qBittorrent restarted.
      sessions.delete(base);
      const result = await login(input.config, password);
      if (!result.ok) return { error: result };
      response = await send({ cookie: result.cookie });
    }
    return { status: response.status, body: response.body };
  } catch (error) {
    return {
      error: {
        ok: false,
        cookie: '',
        status: 'unreachable',
        message: error instanceof Error ? error.message : String(error),
        latencyMs: 0,
      },
    };
  }
}

export async function qbitTest(rawInput: ScraperQbitInput): Promise<QbitStatusReport> {
  const input = normalizeQbitInput(rawInput);
  const { config } = input;
  if (!config.enabled) {
    return {
      status: 'not-configured',
      version: '',
      message: 'Sending to qBittorrent is turned off.',
      latencyMs: 0,
    };
  }
  const mode = authModeOf(config);

  // A key authenticates on its own, so a missing username is only a problem in
  // password mode. Asking for one in key mode was the fastest way to make a
  // working key look broken.
  if (mode === 'apiKey') {
    const problem = apiKeyProblem(await resolveApiKey(input));
    if (problem) {
      return { status: 'unauthorized', version: '', message: problem, latencyMs: 0 };
    }
  } else {
    if (!config.username) {
      return { status: 'unauthorized', version: '', message: 'No username is set.', latencyMs: 0 };
    }
    const password = await resolvePassword(input);
    if (!password) {
      return {
        status: 'unauthorized',
        version: '',
        message: 'No password is stored for this account.',
        latencyMs: 0,
      };
    }
  }

  const started = Date.now();
  // A test must not pass on a session minted by the previous credential.
  sessions.delete(qbitBaseUrl(config));

  const version = await authed(input, '/api/v2/app/version');
  const latencyMs = Date.now() - started;
  if ('error' in version) {
    return {
      status: version.error.status,
      version: '',
      message: version.error.message,
      latencyMs,
    };
  }
  // In password mode a bad base path or port already failed at the login. Key
  // mode has no login step, so this is the only place a 404 from a wrong
  // `basePath` can be caught before it is reported as a connection.
  if (version.status !== 200) {
    return {
      status: version.status === 401 || version.status === 403 ? 'unauthorized' : 'unreachable',
      version: '',
      message: `qBittorrent answered ${version.status} to the version request.`,
      latencyMs,
    };
  }
  const label = version.body.trim().replace(/^v/, '');
  scraperLog('info', 'qbit', `Connected to ${config.host}:${config.port} (v${label}).`);
  return {
    status: 'connected',
    version: label,
    message: `Connected to ${config.host}:${config.port}.`,
    latencyMs,
  };
}

export async function qbitTransfers(rawInput: ScraperQbitInput): Promise<QbitTransferRow[]> {
  const input = normalizeQbitInput(rawInput);
  if (!input.config.enabled) return [];
  const response = await authed(input, '/api/v2/torrents/info');
  if ('error' in response) {
    scraperLog('warn', 'qbit', `Could not list transfers: ${response.error.message}`);
    return [];
  }
  if (response.status !== 200) {
    scraperLog('warn', 'qbit', `Transfer list answered ${response.status}.`);
    return [];
  }
  try {
    const parsed = JSON.parse(response.body) as QbitTorrentInfo[];
    return Array.isArray(parsed) ? parsed.map(mapTransfer) : [];
  } catch {
    scraperLog('warn', 'qbit', 'Transfer list was not valid JSON.');
    return [];
  }
}

/** The `torrents/add` form, built from the profile's send options. */
export function buildAddForm(
  config: ScraperQbittorrentSettings,
  magnets: string[],
): URLSearchParams {
  const form = new URLSearchParams();
  form.set('urls', magnets.join('\n'));
  if (config.category) form.set('category', config.category);
  if (config.tags.length) form.set('tags', config.tags.join(','));
  if (config.savePath) form.set('savepath', config.savePath);
  form.set('paused', config.addMode === 'paused' ? 'true' : 'false');
  if (config.addMode === 'forced') form.set('forceStart', 'true');
  form.set('contentLayout', {
    original: 'Original',
    subfolder: 'Subfolder',
    nosubfolder: 'NoSubfolder',
  }[config.contentLayout]);
  form.set('sequentialDownload', String(config.sequentialDownload));
  form.set('firstLastPiecePrio', String(config.firstLastPiecePriority));
  form.set('skip_checking', String(config.skipHashCheck));
  form.set('autoTMM', String(config.autoTmm));
  if (config.ratioLimit >= 0) form.set('ratioLimit', String(config.ratioLimit));
  if (config.seedingTimeLimitMin >= 0) {
    form.set('seedingTimeLimit', String(config.seedingTimeLimitMin));
  }
  // qBittorrent takes bytes per second; the profile stores KiB/s.
  if (config.uploadLimitKbps > 0) form.set('upLimit', String(config.uploadLimitKbps * 1_024));
  if (config.downloadLimitKbps > 0) form.set('dlLimit', String(config.downloadLimitKbps * 1_024));
  if (config.renameTemplate) form.set('rename', config.renameTemplate);
  return form;
}

/**
 * What to tell the user when `torrents/add` refuses.
 *
 * qBittorrent explains itself in the response body and the status alone does
 * not: a 409 is "Torrent is already in the transfer list" *and* "Save path is
 * not writable" *and* several others. Measured live — a real send returned
 * `409` with the body naming the cause, and the report said only "qBittorrent
 * answered 409.", which is the generic failure the contingency gates exist to
 * forbid.
 *
 * The body is short and already user-facing; it is trimmed and length-capped
 * rather than mapped, so a message this build has never seen still reaches the
 * user instead of being flattened to a number.
 */
export function addFailureReason(status: number, body: string): string {
  const detail = (body ?? '').trim().replace(/\s+/g, ' ').slice(0, 200);
  if (!detail) return `qBittorrent answered ${status}.`;
  return `qBittorrent answered ${status}: ${detail}`;
}

/**
 * What qBittorrent 5.2 reports from `torrents/add`.
 *
 * Measured live against v5.2.3, because the 4.x contract this client was written
 * for no longer holds: a successful add answers **JSON**, not `Ok.`, and a batch
 * can come back `200` with `failure_count` above zero. Treating any 200 as "every
 * row sent" therefore reports links the daemon refused as delivered — the false
 * success the acquisition gates exist to forbid.
 */
export interface QbitAddOutcome {
  addedIds: string[];
  successCount: number;
  failureCount: number;
  pendingCount: number;
}

/**
 * Parse the 5.2 add result, or `null` when the daemon did not send one.
 *
 * `null` is the 4.x path (`Ok.`), which is a plain-text body and still supported:
 * the caller keeps its old whole-batch behaviour there, because that contract
 * genuinely carries no per-row information.
 */
export function parseAddOutcome(body: string): QbitAddOutcome | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const counts = ['success_count', 'failure_count', 'pending_count'];
  if (!counts.some((key) => typeof record[key] === 'number')) return null;
  const ids = Array.isArray(record.added_torrent_ids) ? record.added_torrent_ids : [];
  const num = (key: string) => (typeof record[key] === 'number' ? (record[key] as number) : 0);
  return {
    addedIds: ids.filter((id): id is string => typeof id === 'string').map((id) => id.toLowerCase()),
    successCount: num('success_count'),
    failureCount: num('failure_count'),
    pendingCount: num('pending_count'),
  };
}

/**
 * The v1 infohash a magnet names, lowercased, or `''` when it cannot be read.
 *
 * Only hex is decoded — 40 hex characters for `btih`, 64 for a v2 `btmh`. A
 * base32 `btih` returns `''` and the caller falls back to a whole-batch verdict
 * rather than guessing which row the daemon refused.
 */
export function magnetInfoHash(magnet: string): string {
  const match = /\bxt=urn:bt(?:ih|mh):([0-9a-fA-F]{40}|[0-9a-fA-F]{64})\b/.exec(magnet ?? '');
  return match ? match[1].toLowerCase() : '';
}

/**
 * Turn a `200` add response into a per-row outcome.
 *
 * The asymmetry here is deliberate. When the daemon refuses part of a batch and
 * the rows cannot be matched to it by infohash, every row is reported failed
 * rather than sent: a false failure is visible and the user can look in
 * qBittorrent, whereas a false success silently loses an episode.
 */
export function settleAddedRows(
  rows: readonly TorrentRow[],
  outcome: QbitAddOutcome | null,
): QbitSendReport['details'] {
  const sent = (row: TorrentRow) => ({ name: row.name, outcome: 'sent' as const, reason: '' });
  // No JSON body is the 4.x contract, which reports a whole-batch result only.
  if (!outcome || outcome.failureCount <= 0) return rows.map(sent);

  const added = new Set(outcome.addedIds);
  const unmatched = rows.filter((row) => {
    const hash = magnetInfoHash(row.magnet);
    return !hash || !added.has(hash);
  });
  if (unmatched.length !== outcome.failureCount) {
    const reason =
      `qBittorrent accepted ${outcome.successCount} of ${rows.length} links and refused `
      + `${outcome.failureCount}, without naming which.`;
    return rows.map((row) => ({ name: row.name, outcome: 'failed' as const, reason }));
  }
  const refused = new Set(unmatched);
  return rows.map((row) => (refused.has(row)
    ? { name: row.name, outcome: 'failed' as const, reason: 'qBittorrent did not accept this link.' }
    : sent(row)));
}

/** Lowercased infohashes qBittorrent is already holding, for the 409 branch. */
async function presentHashes(input: ScraperQbitInput): Promise<Set<string>> {
  const transfers = await qbitTransfers(input);
  return new Set(transfers.map((row) => row.hash.toLowerCase()).filter(Boolean));
}

/**
 * The signature promises a report, so an unexpected throw must become one.
 *
 * A rejection here crosses IPC as a raw main-process stack the dialog cannot
 * read, and the user is told nothing about the rows they selected. Failing every
 * row with the message is the honest answer: nothing was confirmed sent.
 */
export async function qbitSend(rawInput: ScraperQbitSendInput): Promise<QbitSendReport> {
  const input = normalizeQbitInput(rawInput);
  const rows: TorrentRow[] = Array.isArray(rawInput.rows) ? rawInput.rows : [];
  try {
    return await sendToQbit(input, rows);
  } catch (error) {
    const reason = `qBittorrent send failed: ${error instanceof Error ? error.message : String(error)}`;
    scraperLog('error', 'qbit', reason);
    return {
      sent: 0,
      skipped: 0,
      failed: rows.length,
      details: rows.map((row) => ({ name: row.name, outcome: 'failed' as const, reason })),
    };
  }
}

async function sendToQbit(
  input: ScraperQbitSendInput,
  rows: TorrentRow[],
): Promise<QbitSendReport> {
  const details: QbitSendReport['details'] = [];

  if (!input.config.enabled) {
    return {
      sent: 0,
      skipped: 0,
      failed: rows.length,
      details: rows.map((row) => ({
        name: row.name,
        outcome: 'failed' as const,
        reason: 'qBittorrent is not enabled.',
      })),
    };
  }

  // A row with no magnet cannot be sent, and a dead swarm is worth telling the
  // user about before qBittorrent sits on it forever.
  const sendable: TorrentRow[] = [];
  for (const row of rows) {
    if (!row.magnet) {
      details.push({ name: row.name, outcome: 'skipped', reason: 'No magnet link.' });
    } else if (row.seeders === 0) {
      details.push({ name: row.name, outcome: 'skipped', reason: 'No seeders.' });
    } else {
      sendable.push(row);
    }
  }

  if (sendable.length) {
    // One request for the batch: qBittorrent's add endpoint takes a newline
    // separated list, and a per-row request would mean a login round-trip each.
    const form = buildAddForm(input.config, sendable.map((row) => row.magnet));
    const response = await authed(input, '/api/v2/torrents/add', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    if ('error' in response) {
      const reason = response.error.message;
      for (const row of sendable) details.push({ name: row.name, outcome: 'failed', reason });
      scraperLog('error', 'qbit', `Send failed: ${reason}`);
    } else if (response.status === 200) {
      details.push(...settleAddedRows(sendable, parseAddOutcome(response.body)));
      const sentNow = details.filter((d) => d.outcome === 'sent').length;
      scraperLog('info', 'qbit', `Sent ${sentNow} of ${sendable.length} torrent(s) to qBittorrent.`);
    } else {
      // A 409 means the daemon added *nothing* from this batch, and v5.2.3's body
      // is the literal word "Conflict" — no cause, so `addFailureReason` alone
      // leaves the user with a number. The one cause the app can establish itself
      // is the common one: the torrent is already in the transfer list.
      const already = response.status === 409 ? await presentHashes(input) : new Set<string>();
      const generic = addFailureReason(response.status, response.body);
      for (const row of sendable) {
        const hash = magnetInfoHash(row.magnet);
        const reason = hash && already.has(hash)
          ? 'Already in qBittorrent.'
          : generic;
        details.push({ name: row.name, outcome: 'failed', reason });
      }
      scraperLog('error', 'qbit', `Send failed: ${generic}`);
    }
  }

  return {
    sent: details.filter((d) => d.outcome === 'sent').length,
    skipped: details.filter((d) => d.outcome === 'skipped').length,
    failed: details.filter((d) => d.outcome === 'failed').length,
    details,
  };
}

/** Test seam — drops every cached session. */
export function resetQbitSessions(): void {
  sessions.clear();
}

// --------------------------------------------------- selective subtitle fetch ---
//
// Everything below serves one caller: `subtitleNyaaSource.ts`, which needs a
// few hundred KB out of a torrent without downloading the rest. The operations
// above hand a magnet over and forget about it; these follow one through to
// completed bytes on disk.
//
// Two rules shape the whole section:
//
//   1. A torrent the user already has is never touched. Setting file
//      priorities on someone's own transfer would silently stop files they
//      asked for, and the damage would not show up until they went looking for
//      an episode that never finished.
//   2. Everything this adds is tagged, so a user who never wants the app in
//      their client can find and remove all of it in one filter. The app does
//      not delete from qBittorrent — that is the user's client and their call.

/** Category and tag applied to every torrent added for a subtitle fetch. */
export const QBIT_SUBTITLE_CATEGORY = 'jp-study-subtitles';

/** Priority values qBittorrent's `filePrio` takes. */
export const QBIT_PRIO_SKIP = 0;
export const QBIT_PRIO_NORMAL = 1;

export interface QbitFileEntry {
  /** Index qBittorrent addresses the file by in `filePrio`. */
  index: number;
  /** Path inside the torrent, e.g. `Show/Subs/ep01.ass`. */
  name: string;
  sizeBytes: number;
  /** 0..1. */
  progress: number;
  priority: number;
}

interface QbitRawFile {
  index?: number;
  name?: string;
  size?: number;
  progress?: number;
  priority?: number;
}

export type QbitOutcome<T> = { ok: true; value: T } | { ok: false; reason: string };

function failureReason(response: { error: LoginResult } | { status: number; body: string }): string {
  return 'error' in response
    ? response.error.message
    : `qBittorrent answered ${response.status}.`;
}

/**
 * Whether qBittorrent already knows this hash.
 *
 * The gate for rule 1. `torrents/info?hashes=` answers with an empty array for
 * an unknown hash rather than a 404, so an empty array is the "safe to add"
 * signal.
 */
export async function qbitTorrentInfo(
  input: ScraperQbitInput,
  hash: string,
): Promise<QbitOutcome<QbitTransferRow | null>> {
  const wanted = hash.trim().toLowerCase();
  if (!wanted) return { ok: false, reason: 'No info hash.' };
  const response = await authed(input, `/api/v2/torrents/info?hashes=${encodeURIComponent(wanted)}`);
  if ('error' in response || response.status !== 200) {
    return { ok: false, reason: failureReason(response) };
  }
  try {
    const parsed = JSON.parse(response.body) as QbitTorrentInfo[];
    if (!Array.isArray(parsed) || parsed.length === 0) return { ok: true, value: null };
    return { ok: true, value: mapTransfer(parsed[0]) };
  } catch {
    return { ok: false, reason: 'The torrent list was not valid JSON.' };
  }
}

/**
 * Adds a magnet so it fetches its own metadata and then stops itself.
 *
 * Deliberately does **not** use `buildAddForm`: that applies the profile's own
 * add mode, which may be `forced`, and starting a 12 GB batch at full tilt is
 * the exact outcome this provider exists to prevent. The form here is fixed.
 *
 * **`paused`/`stopped` is exactly what this must not send.** A magnet added
 * stopped never contacts the swarm, so its metadata never arrives and
 * `torrents/files` answers `200 []` for as long as it exists — measured against
 * the real daemon on a 26-file release, which reported **0 files**. Every nyaa
 * fetch then read that empty list and told the user the release contained no
 * subtitles. `stopCondition=MetadataReceived` (qBittorrent 4.5+) is the
 * primitive that actually fits: the torrent runs only until the file list
 * arrives — measured at **4 s, 26 files, `downloaded: 0`** — and puts itself
 * back to `stoppedDL` before any content byte is chosen. `qbitAwaitMetadata`
 * stops it a second time for builds that do not know the parameter.
 */
export async function qbitAddStopped(
  input: ScraperQbitInput,
  magnet: string,
  hash: string,
): Promise<QbitOutcome<'added' | 'already-present'>> {
  if (!input.config.enabled) return { ok: false, reason: 'qBittorrent is not enabled.' };
  if (!magnet) return { ok: false, reason: 'No magnet link.' };

  const existing = await qbitTorrentInfo(input, hash);
  if (!existing.ok) return { ok: false, reason: existing.reason };
  if (existing.value) {
    // Rule 1. The caller decides whether it can use the transfer as it stands.
    return { ok: true, value: 'already-present' };
  }

  const form = new URLSearchParams();
  form.set('urls', magnet);
  form.set('stopCondition', 'MetadataReceived');
  form.set('category', QBIT_SUBTITLE_CATEGORY);
  form.set('tags', QBIT_SUBTITLE_CATEGORY);
  // Original layout keeps the paths the torrent declares, which is what the
  // file list is matched against.
  form.set('contentLayout', 'Original');
  form.set('autoTMM', 'false');
  if (input.config.savePath) form.set('savepath', input.config.savePath);

  const response = await authed(input, '/api/v2/torrents/add', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  if ('error' in response || response.status !== 200) {
    return { ok: false, reason: failureReason(response) };
  }
  scraperLog('info', 'qbit', `Added a subtitle fetch stopped (${hash.slice(0, 8)}).`);
  return { ok: true, value: 'added' };
}

/**
 * Stops a running torrent.
 *
 * Mirror of `qbitStart`: `pause` is the endpoint every 4.x build has and 5.x
 * still honours, `stop` is 5.x's replacement.
 */
export async function qbitStop(
  input: ScraperQbitInput,
  hash: string,
): Promise<QbitOutcome<true>> {
  const body = new URLSearchParams({ hashes: hash.trim().toLowerCase() }).toString();
  const headers = { 'content-type': 'application/x-www-form-urlencoded' };
  let response = await authed(input, '/api/v2/torrents/pause', { method: 'POST', headers, body });
  if (!('error' in response) && (response.status === 404 || response.status === 405)) {
    response = await authed(input, '/api/v2/torrents/stop', { method: 'POST', headers, body });
  }
  if ('error' in response || response.status !== 200) {
    return { ok: false, reason: failureReason(response) };
  }
  return { ok: true, value: true };
}

/**
 * The files inside a torrent.
 *
 * `index` is absent on older builds, where the array position is the index —
 * so position is the fallback rather than an error. Getting this wrong sets
 * priorities on the wrong files, which is silent and would be very hard to
 * spot from the outside.
 */
export async function qbitFiles(
  input: ScraperQbitInput,
  hash: string,
): Promise<QbitOutcome<QbitFileEntry[]>> {
  const wanted = hash.trim().toLowerCase();
  if (!wanted) return { ok: false, reason: 'No info hash.' };
  const response = await authed(input, `/api/v2/torrents/files?hash=${encodeURIComponent(wanted)}`);
  if ('error' in response || response.status !== 200) {
    return { ok: false, reason: failureReason(response) };
  }
  try {
    const parsed = JSON.parse(response.body) as QbitRawFile[];
    if (!Array.isArray(parsed)) return { ok: false, reason: 'The file list was not a list.' };
    return {
      ok: true,
      value: parsed.map((file, position) => ({
        index: Number.isFinite(file.index) ? Number(file.index) : position,
        name: file.name ?? '',
        sizeBytes: file.size ?? 0,
        progress: Math.max(0, Math.min(1, file.progress ?? 0)),
        priority: file.priority ?? QBIT_PRIO_NORMAL,
      })),
    };
  } catch {
    return { ok: false, reason: 'The file list was not valid JSON.' };
  }
}

/** Sets one priority across a set of file indexes. This is Route B's mechanism. */
export async function qbitSetFilePriorities(
  input: ScraperQbitInput,
  hash: string,
  indexes: readonly number[],
  priority: number,
): Promise<QbitOutcome<number>> {
  if (!indexes.length) return { ok: true, value: 0 };
  const form = new URLSearchParams();
  form.set('hash', hash.trim().toLowerCase());
  form.set('id', indexes.join('|'));
  form.set('priority', String(priority));
  const response = await authed(input, '/api/v2/torrents/filePrio', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  if ('error' in response || response.status !== 200) {
    return { ok: false, reason: failureReason(response) };
  }
  return { ok: true, value: indexes.length };
}

/**
 * Starts a stopped torrent.
 *
 * `resume` is the endpoint every 4.x build has and 5.x still honours; `start`
 * is 5.x's replacement. Trying `resume` first means the common case is one
 * request, and the fallback covers a future build that finally drops it.
 */
export async function qbitStart(
  input: ScraperQbitInput,
  hash: string,
): Promise<QbitOutcome<true>> {
  const body = new URLSearchParams({ hashes: hash.trim().toLowerCase() }).toString();
  const headers = { 'content-type': 'application/x-www-form-urlencoded' };
  let response = await authed(input, '/api/v2/torrents/resume', { method: 'POST', headers, body });
  if (!('error' in response) && (response.status === 404 || response.status === 405)) {
    response = await authed(input, '/api/v2/torrents/start', { method: 'POST', headers, body });
  }
  if ('error' in response || response.status !== 200) {
    return { ok: false, reason: failureReason(response) };
  }
  return { ok: true, value: true };
}

export interface QbitAwaitOptions {
  timeoutMs: number;
  pollMs?: number;
  /** Checked between polls so a cancelled discovery stops waiting. */
  isCancelled?: () => boolean;
  /** Injected in tests so a wait does not cost real seconds. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

/**
 * Waits until a magnet's file list exists, then makes sure it is not running.
 *
 * A magnet names no files. Until the metadata arrives from the swarm,
 * `torrents/files` answers `200` with an empty array — indistinguishable, to a
 * caller that reads it once, from a release that genuinely holds no subtitles.
 * That single read is what made the nyaa provider a total false negative, so
 * this wait is not a refinement of the fetch; it is the step without which no
 * fetch of either route can ever succeed.
 *
 * `stopWhenReady` belongs to the caller because ownership does: a torrent this
 * process added is ours to stop, and one the user already had is not — pausing
 * theirs would silently halt a transfer they started.
 */
export async function qbitAwaitMetadata(
  input: ScraperQbitInput,
  hash: string,
  options: QbitAwaitOptions & { stopWhenReady?: boolean },
): Promise<QbitOutcome<QbitFileEntry[]>> {
  const pollMs = options.pollMs ?? 1_000;
  const sleep = options.sleep ?? defaultSleep;
  const deadline = Date.now() + Math.max(0, options.timeoutMs);

  for (;;) {
    if (options.isCancelled?.()) return { ok: false, reason: 'Cancelled.' };

    const files = await qbitFiles(input, hash);
    if (!files.ok) return files;
    if (files.value.length) {
      // `stopCondition=MetadataReceived` has normally done this already; a build
      // that ignores the parameter has not, and the exposure is then one poll
      // interval rather than a whole unbounded download.
      if (options.stopWhenReady) await qbitStop(input, hash);
      return { ok: true, value: files.value };
    }

    if (Date.now() >= deadline) {
      return {
        ok: false,
        reason: 'qBittorrent could not read what is inside this release: no peer sent its file list in time.',
      };
    }
    await sleep(pollMs);
  }
}

/**
 * Waits for a set of files to finish, or gives up.
 *
 * Bounded by construction: a swarm with no seeds never completes, and a
 * subtitle fetch that hangs forever would pin the discovery pipeline on one
 * item. The timeout is a normal outcome here, not an error condition.
 */
export async function qbitAwaitFiles(
  input: ScraperQbitInput,
  hash: string,
  indexes: readonly number[],
  options: QbitAwaitOptions,
): Promise<QbitOutcome<QbitFileEntry[]>> {
  const wanted = new Set(indexes);
  if (!wanted.size) return { ok: false, reason: 'No files were selected.' };
  const pollMs = options.pollMs ?? 1_000;
  const sleep = options.sleep ?? defaultSleep;
  const deadline = Date.now() + Math.max(0, options.timeoutMs);

  for (;;) {
    if (options.isCancelled?.()) return { ok: false, reason: 'Cancelled.' };

    const files = await qbitFiles(input, hash);
    if (!files.ok) return files;

    const selected = files.value.filter((file) => wanted.has(file.index));
    if (selected.length && selected.every((file) => file.progress >= 1)) {
      return { ok: true, value: selected };
    }

    // Progress alone cannot tell "still downloading" from "stopped and never
    // coming". A disk that filled mid-transfer, or files deleted underneath
    // qBittorrent, leaves progress frozen below 1 — so without this the wait
    // burned the whole five-minute timeout and then blamed the timeout.
    const info = await qbitTorrentInfo(input, hash);
    if (info.ok) {
      if (!info.value) {
        return {
          ok: false,
          reason: 'This torrent is no longer in qBittorrent, so the subtitle cannot arrive.',
        };
      }
      if (info.value.state === 'error') {
        return {
          ok: false,
          reason:
            'qBittorrent stopped this torrent with an error, so waiting cannot help — check the free space at its save path.',
        };
      }
    }

    if (Date.now() >= deadline) {
      const done = selected.filter((file) => file.progress >= 1).length;
      return {
        ok: false,
        reason: `Timed out with ${done}/${selected.length} subtitle file(s) complete.`,
      };
    }
    await sleep(pollMs);
  }
}
