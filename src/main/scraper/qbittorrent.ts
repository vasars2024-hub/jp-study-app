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
import type { ScraperQbittorrentSettings } from '../../shared/scraperSourceSettings';
import type { ScraperQbitInput, ScraperQbitSendInput } from '../../shared/scraperIpc';
import { getScraperSecret } from './credentials';
import { scraperRequest } from './http';
import { scraperLog } from './logBus';

const TIMEOUT_MS = 12_000;

/** Live sessions, keyed by base URL. Cleared when a call comes back 403. */
const sessions = new Map<string, string>();

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
    sessions.set(base, sid);
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

/** A logged-in request, retrying once through a fresh login on a 403. */
async function authed(
  input: ScraperQbitInput,
  path: string,
  init: { method?: string; body?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: string } | { error: LoginResult }> {
  const base = qbitBaseUrl(input.config);
  const password = await resolvePassword(input);

  const send = async (cookie: string) =>
    scraperRequest(`${base}${path}`, {
      method: init.method ?? 'GET',
      headers: { cookie, referer: base, ...init.headers },
      body: init.body,
      timeoutMs: TIMEOUT_MS,
      correlationId: 'qbit',
    });

  let cookie = sessions.get(base) ?? '';
  if (!cookie) {
    const result = await login(input.config, password);
    if (!result.ok) return { error: result };
    cookie = result.cookie;
  }

  try {
    let response = await send(cookie);
    if (response.status === 403) {
      // The session expired or qBittorrent restarted.
      sessions.delete(base);
      const result = await login(input.config, password);
      if (!result.ok) return { error: result };
      response = await send(result.cookie);
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

export async function qbitTest(input: ScraperQbitInput): Promise<QbitStatusReport> {
  const { config } = input;
  if (!config.enabled) {
    return {
      status: 'not-configured',
      version: '',
      message: 'Sending to qBittorrent is turned off.',
      latencyMs: 0,
    };
  }
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

  const started = Date.now();
  sessions.delete(qbitBaseUrl(config));
  const session = await login(config, password);
  if (!session.ok) {
    scraperLog('warn', 'qbit', `Connection test failed: ${session.message}`);
    return {
      status: session.status,
      version: '',
      message: session.message,
      latencyMs: session.latencyMs,
    };
  }

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
  const label = version.body.trim().replace(/^v/, '');
  scraperLog('info', 'qbit', `Connected to ${config.host}:${config.port} (v${label}).`);
  return {
    status: 'connected',
    version: label,
    message: `Connected to ${config.host}:${config.port}.`,
    latencyMs,
  };
}

export async function qbitTransfers(input: ScraperQbitInput): Promise<QbitTransferRow[]> {
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

export async function qbitSend(input: ScraperQbitSendInput): Promise<QbitSendReport> {
  const rows: TorrentRow[] = Array.isArray(input.rows) ? input.rows : [];
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
    if ('error' in response || response.status !== 200) {
      const reason = 'error' in response
        ? response.error.message
        : `qBittorrent answered ${response.status}.`;
      for (const row of sendable) details.push({ name: row.name, outcome: 'failed', reason });
      scraperLog('error', 'qbit', `Send failed: ${reason}`);
    } else {
      for (const row of sendable) details.push({ name: row.name, outcome: 'sent', reason: '' });
      scraperLog('info', 'qbit', `Sent ${sendable.length} torrent(s) to qBittorrent.`);
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
